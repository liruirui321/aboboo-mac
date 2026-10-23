"""A JSON CLI and JSON-lines agent transport. Media never leaves configured storage."""
import argparse
import base64
import contextlib
import datetime
import fcntl
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import urllib.request
import urllib.parse
import uuid

REPO = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = Path.home() / '.config/aboboo/config.json'


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def read(p):
    return json.loads(Path(p).read_text())


def atomic(p, value):
    p = Path(p)
    temp = p.with_name(p.name + '.' + str(uuid.uuid4()) + '.tmp')
    try:
        temp.write_text(json.dumps(value, ensure_ascii=False, indent=2))
        os.replace(temp, p)
    finally:
        temp.unlink(missing_ok=True)


def config(path):
    c = read(path)
    root = Path(c['storage']).expanduser().resolve()
    mount = c.get('mount')
    if mount and not os.path.ismount(mount):
        raise ValueError('SSD 未挂载：' + mount)
    if mount and not root.is_relative_to(Path(mount).resolve()):
        raise ValueError('材料目录不在配置的 SSD 上')
    if not root.is_dir():
        raise ValueError('材料目录不存在；请先运行 init')
    c['storage'] = str(root)
    for name in ('jobs', 'library', 'materials'):
        p = root / name
        if not p.resolve().is_relative_to(root):
            raise ValueError('存储子目录指向 SSD 目录之外：' + name)
        p.mkdir(exist_ok=True)
    return c


@contextlib.contextmanager
def lock(path):
    with open(path, 'a') as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('任务或材料库正在写入，请稍后重试')
        yield


def jobdir(c, ident):
    return Path(c['storage']) / 'jobs' / str(uuid.UUID(ident))


def update(j, **values):
    data = read(j / 'job.json')
    data.update(values, updatedAt=now())
    atomic(j / 'job.json', data)
    return data


def checked(cmd, j, c):
    env = dict(os.environ, TMPDIR=str(j / 'tmp'))
    with open(j / 'pipeline.log', 'a') as log:
        proc = subprocess.Popen([str(x) for x in cmd], stdout=log, stderr=log, env=env, start_new_session=True)
        try:
            code = proc.wait(timeout=c.get('timeoutSeconds', 7200))
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
            raise
        if code:
            raise subprocess.CalledProcessError(code, cmd)


def subtitles(path):
    if path.suffix.lower() == '.json':
        d = read(path)
        return d if isinstance(d, dict) else {'segments': d}
    if path.suffix.lower() != '.srt':
        raise ValueError('字幕支持 SRT 或含 segments 数组的 JSON')
    def seconds(t):
        h, m, s = t.replace(',', '.').split(':')
        return int(h) * 3600 + int(m) * 60 + float(s)
    segments = []
    for block in re.split(r'\n\s*\n', path.read_text(encoding='utf-8-sig').replace('\r\n', '\n').strip()):
        lines = block.splitlines()
        k = next((i for i, s in enumerate(lines) if '-->' in s), None)
        if k is None:
            raise ValueError('无效 SRT 字幕块')
        a, b = lines[k].split('-->')
        segments.append({'start': seconds(a.strip()), 'end': seconds(b.strip()), 'text': ' '.join(lines[k+1:])})
    return {'segments': segments, 'source': '用户提供的 SRT 字幕', 'words': []}


def validate(data, duration, keep):
    rules = [re.compile(x, re.I) for x in read(REPO / 'src/data/exam-instructions.json')]
    out, removed, previous = [], [], 0.0
    for item in data['segments']:
        a, b, text = float(item['start']), float(item['end']), str(item['text']).strip()
        if not text or not all(math.isfinite(v) for v in (a, b)) or not (0 <= a < b <= duration + .05) or a < previous - .001:
            raise ValueError('字幕空白、越界或重叠：' + repr(item))
        previous = b
        normalized = re.sub(r'\s+', ' ', re.sub(r'''[.,!?:;'“”‘’]''', '', text.lower())).strip()
        instruction = any(p.fullmatch(normalized) for p in rules) or bool(re.fullmatch(r'\d+', normalized))
        if instruction and not keep:
            removed.append(item)
        else:
            out.append(dict(start=a, end=min(b, duration), text=text))
    if not out:
        raise ValueError('没有可入库的听写句子')
    return out, removed


def submit(c, args):
    root = Path(c['storage'])
    ident = str(uuid.uuid4())
    j = root / 'jobs' / ident
    j.mkdir()
    (j / 'tmp').mkdir()
    source = args.source
    if not source.startswith(('https://', 'http://')):
        source = str(Path(source).expanduser().resolve())
        if not Path(source).is_file():
            raise ValueError('音频文件不存在')
    payload = dict(id=ident, status='queued', stage='queued', createdAt=now(), updatedAt=now(),
                   source=source, title=args.title, sourceNote=args.source_note,
                   keepInstructions=args.keep_instructions,
                   segmenterProvider=args.segmenter or c.get('segmenterProvider','deepseek'),
                   deepseekModel=c.get('deepseekModel','deepseek-flash'))
    if args.subtitles:
        p = Path(args.subtitles).expanduser().resolve()
        data = subtitles(p)  # Validate syntax, snapshot so later edits cannot change a queued job.
        atomic(j / 'supplied.json', data)
        payload['subtitles'] = 'supplied.json'
    atomic(j / 'job.json', payload)
    return payload


def run(c, ident):
    j = jobdir(c, ident)
    with lock(j / 'run.lock'):
        task = read(j / 'job.json')
        if task['status'] == 'completed':
            return task
        update(j, status='running', stage='download', pid=os.getpid(), error=None)
        try:
            source = j / 'source.audio'
            if not source.exists():
                partial = j / 'source.partial'
                remote = task['source'].startswith(('https://', 'http://'))
                stream = urllib.request.urlopen(task['source'], timeout=60) if remote else open(task['source'], 'rb')
                size = 0
                with stream as inp, open(partial, 'wb') as out:
                    while True:
                        chunk = inp.read(1024 * 1024)
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > c.get('maxBytes', 1024 * 1024 * 1024):
                            raise ValueError('音频超过导入大小上限')
                        out.write(chunk)
                os.replace(partial, source)
            update(j, stage='decode')
            audio = j / 'audio.mp3'
            if not audio.exists():
                checked([c['ffmpeg'], '-v', 'error', '-xerror', '-y', '-i', source, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-q:a', '2', j/'audio.partial.mp3'], j, c)
                os.replace(j / 'audio.partial.mp3', audio)
            # A full decode verifies the file, not only its possibly inaccurate duration header.
            checked([c['ffmpeg'], '-v', 'error', '-xerror', '-y', '-i', audio, '-ar', '16000', '-ac', '1', '-f', 's16le', j/'tmp/check.pcm'], j, c)
            duration = (j / 'tmp/check.pcm').stat().st_size / 32000
            (j / 'tmp/check.pcm').unlink()
            if not 0 < duration <= c.get('maxDuration', 7200):
                raise ValueError('音频时长必须介于 0 到 7200 秒')
            # Original bytes identify a material; resubmission never replaces answers or favorites.
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            pid = str(uuid.uuid5(uuid.NAMESPACE_URL, 'aboboo-cli-v1:' + digest))
            target = Path(c['storage']) / 'library' / (pid + '.abmac')
            if target.exists():
                doc = read(target)
                publish(c, doc)  # Repair an interrupted metadata commit without changing progress.
                return update(j, status='completed', stage='completed', materialId=pid, deduplicated=True)
            if task.get('subtitles'):
                data = read(j / task['subtitles'])
            else:
                update(j, stage='transcribe')
                if not (j/'words.json').exists():
                    checked([sys.executable, REPO/'cli/aboboo_cli/transcribe.py', audio, j/'words.json', c['whisper'], c['model'], c['ffmpeg']], j, c)
                update(j, stage='segment')
                if not (j/'segments.json').exists():
                    provider = task.get('segmenterProvider',c.get('segmenterProvider','deepseek'))
                    if provider == 'qwen':
                        checked([c['segmenter'], j/'words.json', c['llm'], j/'segments.partial.json'], j, c)
                        os.replace(j/'segments.partial.json', j/'segments.json')
                    else:
                        from .segmentation import segment
                        atomic(j/'segments.json',segment(read(j/'words.json'), j, provider, task.get('deepseekModel',c.get('deepseekModel','deepseek-flash'))))
                data = read(j/'segments.json')
            update(j, stage='validate')
            ss, removed = validate(data, duration, task['keepInstructions'])
            warnings = (['自动字幕需要人工核对'] if not task.get('subtitles') else []) + data.get('warnings',[])
            if any(len(s['text'].split()) > 45 for s in ss):
                warnings.append('存在超过 45 词的句子，请检查分句')
            if '回退' in data.get('source', '') and not data.get('warnings'):
                warnings.append('部分分句使用标点回退，请检查')
            atomic(j/'validation.json', dict(removedInstructions=removed, warnings=warnings))
            tid = str(uuid.uuid5(uuid.NAMESPACE_URL, pid + ':audio'))
            media = Path(c['storage'])/'materials'/(pid+'.mp3')
            media_tmp = media.with_name(media.name + '.' + str(uuid.uuid4()) + '.tmp')
            shutil.copyfile(audio, media_tmp)
            os.replace(media_tmp, media)
            for i, s in enumerate(ss):
                s.update(id=str(uuid.uuid5(uuid.NAMESPACE_URL, pid+':'+str(i))), answer='', submitted=False, revealed=False, attempts=0)
            title = task['title'] or Path(urllib.parse.urlparse(task['source']).path).stem or '新材料'
            doc = dict(format='aboboo-community-v1', id=pid, libraryId=pid, name=title, duration=duration,
                       originalAudioPath=str(media), tracks=[dict(id=tid,type='original',name='Original',audioPath=str(media),startTime=0,duration=duration,volume=1,muted=False)],
                       metadata=dict(createdAt=now(),updatedAt=now()), materialSource=dict(source=task['source'],note=task['sourceNote'],sha256=digest,importedAt=now()),
                       favorites=[], dictation=dict(sentences=ss,index=0,source=data.get('source','用户提供的字幕'),words=data.get('words',[]),segmentationVersion=2),
                       embeddedAudio={tid:dict(data=base64.b64encode(audio.read_bytes()).decode(),mime='audio/mpeg')})
            update(j, stage='publish')
            publish(c, doc)
            return update(j, status='completed', stage='completed', materialId=pid, sentenceCount=len(ss), removedInstructions=len(removed), warnings=warnings, deduplicated=False)
        except Exception as e:
            update(j, status='failed', error=str(e))
            raise


def publish(c, doc):
    lib = Path(c['storage'])/'library'
    with lock(lib/'.cli.lock'):
        target = lib/(doc['id']+'.abmac')
        if not target.exists():
            atomic(target, doc)
        else:
            doc = read(target)
        atomic(lib/(doc['id']+'.meta.json'), dict(id=doc['id'], name=doc['name'], duration=doc['duration'],sentenceCount=len(doc['dictation']['sentences']),completed=0,favorites=0))


def start_worker(cpath, j):
    with open(j/'worker.log', 'a') as log:
        p = subprocess.Popen([sys.executable, str(REPO/'cli/aboboo'), '--config', str(cpath), 'run', j.name],
                             stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True, close_fds=True)
    return p.pid


def dispatch(args):
    cpath = Path(args.config).expanduser().resolve()
    if args.command == 'init':
        if cpath.exists():
            raise ValueError('配置已存在；不会覆盖：' + str(cpath))
        root = Path(args.storage).expanduser().resolve()
        mount = next((str(p) for p in [root, *root.parents] if str(p).startswith('/Volumes/') and os.path.ismount(p)), None)
        if str(root).startswith('/Volumes/') and not mount:
            raise ValueError('外置磁盘未挂载')
        root.mkdir(parents=True, exist_ok=True)
        cpath.parent.mkdir(parents=True, exist_ok=True)
        atomic(cpath, dict(storage=str(root),mount=mount,ffmpeg=shutil.which('ffmpeg') or 'ffmpeg',
            whisper=str(REPO/'src-tauri/resources/asr/whisper-cli'), model=str(REPO/'src-tauri/resources/asr/model.bin'),
            segmenterProvider='deepseek',deepseekModel='deepseek-flash',segmenter=str(REPO/'target/release/prepare-material'), llm=str(REPO/'src-tauri/resources/llm')))
        return dict(config=str(cpath), storage=str(root))
    if args.command == 'serve':
        # One request per line: {id, argv:["submit", ...]}. No arbitrary shell execution.
        for line in sys.stdin:
            req = {}
            try:
                req = json.loads(line)
                argv = req['argv']
                if not isinstance(argv, list) or not argv or argv[0] not in ('doctor','submit','retry','status','jobs','materials') or not all(isinstance(x,str) for x in argv):
                    raise ValueError('允许命令：doctor, submit, retry, status, jobs, materials')
                with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                    nested = parser().parse_args(['--config',str(cpath),*argv])
                value = dispatch(nested)
                emit(dict(id=req.get('id'),ok=True,result=value))
            except (Exception, SystemExit) as e:
                emit(dict(id=req.get('id') if isinstance(req,dict) else None,ok=False,error=str(e)))
        return None
    c = config(cpath)
    if args.command == 'doctor':
        checks = {k:Path(c[k]).is_file() for k in ('ffmpeg','whisper','model')}
        provider = c.get('segmenterProvider','deepseek')
        if provider == 'qwen':
            checks['segmenter'] = Path(c['segmenter']).is_file()
            checks['llm'] = all((Path(c['llm'])/f).is_file() for f in ('llama-completion','qwen.gguf'))
        desktop = Path.home()/'Library/Application Support/local.aboboo.community/library'
        return dict(ready=all(checks.values()),checks=checks,segmenterProvider=provider,deepseekConfigured=bool(os.environ.get('DEEPSEEK_API_KEY')),storage=c['storage'],desktopConnected=desktop.resolve()==(Path(c['storage'])/'library').resolve())
    if args.command in ('ingest','submit'):
        task = submit(c,args)
        if args.command == 'ingest':
            return run(c,task['id'])
        task['workerPid'] = start_worker(cpath,jobdir(c,task['id']))
        return task
    if args.command == 'run':
        return run(c,args.id)
    if args.command == 'retry':
        j = jobdir(c,args.id)
        task = read(j/'job.json')
        if task['status'] == 'completed':
            return task
        return dict(id=task['id'],status='queued',previousStatus=task['status'],workerPid=start_worker(cpath,j))
    if args.command == 'status':
        j = jobdir(c,args.id)
        task = read(j/'job.json')
        if task['status'] == 'running':
            try:
                with lock(j/'run.lock'):
                    task['status'] = 'interrupted'
                    task['hint'] = '运行 retry 继续未完成任务'
            except ValueError:
                pass
        return task
    if args.command == 'jobs':
        return [read(p) for p in sorted((Path(c['storage'])/'jobs').glob('*/job.json'))]
    if args.command == 'materials':
        return [read(p) for p in sorted((Path(c['storage'])/'library').glob('*.meta.json')) if not p.name.startswith('._') and p.with_name(p.name.replace('.meta.json','.abmac')).exists()]


def parser():
    p = argparse.ArgumentParser(description='Aboboo 材料通道；命令结果均为 JSON')
    p.add_argument('--config',default=os.environ.get('ABOBOO_CONFIG',str(DEFAULT_CONFIG)))
    sub = p.add_subparsers(dest='command',required=True)
    init = sub.add_parser('init');init.add_argument('--storage',required=True)
    for name in ('doctor','jobs','materials','serve'):
        sub.add_parser(name)
    for name in ('status','run','retry'):
        sub.add_parser(name).add_argument('id')
    for name in ('ingest','submit'):
        q = sub.add_parser(name)
        q.add_argument('source',help='本地文件或 HTTP(S) 音频直链')
        q.add_argument('--title')
        q.add_argument('--segmenter',choices=['deepseek','punctuation','qwen'],help='默认 DeepSeek API；punctuation 完全离线；qwen 为旧的可选本地模型')
        q.add_argument('--subtitles',help='SRT 或 segments JSON；省略则离线 Whisper + Qwen')
        q.add_argument('--source-note',default='',help='来源、日期和音频类型等说明')
        q.add_argument('--keep-instructions',action='store_true')
    return p


def emit(value):
    print(json.dumps(value,ensure_ascii=False),flush=True)


def main():
    try:
        result = dispatch(parser().parse_args())
        if result is not None:
            emit(dict(ok=True,result=result))
    except Exception as e:
        emit(dict(ok=False,error=str(e)))
        sys.exit(1)


if __name__ == '__main__':
    main()
