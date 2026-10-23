"""Integration tests use real ffmpeg and isolated storage; no personal library edits."""
import json
import http.server
import threading
import functools
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

REPO = Path(__file__).resolve().parents[1]
CLI = REPO/'cli/aboboo'


class CliTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=os.environ.get('ABOBOO_TEST_TMP'))
        self.root = Path(self.tmp.name)
        self.cfg = self.root/'config.json'
        self.call('init','--storage',str(self.root/'storage'))
        self.audio = self.root/'input.wav'
        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:duration=2',str(self.audio)],check=True)
        self.subs = self.root/'input.srt'
        self.subs.write_text('1\n00:00:00,000 --> 00:00:00,500\nNow listen and answer questions 1 to 5.\n\n2\n00:00:00,500 --> 00:00:01,800\nHello world.\n')

    def tearDown(self):
        # AppleDouble files on exFAT can disappear with their partner file.
        import shutil
        shutil.rmtree(self.root, ignore_errors=True)
        self.tmp.cleanup()

    def call(self,*args,ok=True):
        p = subprocess.run([sys.executable,str(CLI),'--config',str(self.cfg),*args],capture_output=True,text=True)
        d = json.loads(p.stdout)
        self.assertEqual(d['ok'],ok,p.stderr+p.stdout)
        self.assertEqual(p.returncode,0 if ok else 1)
        return d.get('result',d)

    def ingest(self):
        return self.call('ingest',str(self.audio),'--title','CLI 测试','--subtitles',str(self.subs))

    def test_publish_dedupe_preserves_answers(self):
        a = self.ingest()
        self.assertEqual(a['sentenceCount'],1)
        self.assertEqual(a['removedInstructions'],1)
        progress = self.root/'storage/library'/(a['materialId']+'.progress.json')
        progress.write_text('{"favorites":[{"text":"keep me"}]}')
        b = self.ingest()
        self.assertTrue(b['deduplicated'])
        self.assertEqual(a['materialId'],b['materialId'])
        self.assertIn('keep me',progress.read_text())
        self.assertEqual(len(self.call('materials')),1)
        self.assertEqual(self.call('status',a['id'])['status'],'completed')

    def test_invalid_subtitles_never_publish(self):
        self.subs.write_text('1\n00:00:00,000 --> 00:00:09,000\nBad duration.\n')
        self.call('ingest',str(self.audio),'--subtitles',str(self.subs),ok=False)
        self.assertEqual(self.call('materials'),[])
        self.assertEqual(self.call('jobs')[0]['status'],'failed')

    def test_resume_failed_job(self):
        original = json.loads(self.cfg.read_text());broken = dict(original,ffmpeg='/nonexistent/ffmpeg')
        self.cfg.write_text(json.dumps(broken))
        self.call('ingest',str(self.audio),'--subtitles',str(self.subs),ok=False)
        job = self.call('jobs')[0]
        self.cfg.write_text(json.dumps(original))
        result = self.call('run',job['id'])
        self.assertEqual(result['status'],'completed')

    def test_http_import_and_size_limit(self):
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self,*args):
                pass
        server = http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(self.root)))
        thread = threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            url = f'http://127.0.0.1:{server.server_port}/input.wav'
            c = json.loads(self.cfg.read_text());c['maxBytes']=1;self.cfg.write_text(json.dumps(c))
            self.call('ingest',url,'--subtitles',str(self.subs),ok=False)
            self.assertEqual(self.call('materials'),[])
            c['maxBytes']=10000000;self.cfg.write_text(json.dumps(c))
            result = self.call('run',self.call('jobs')[0]['id'])
            self.assertEqual(result['status'],'completed')
        finally:
            server.shutdown();server.server_close();thread.join()

    def test_missing_ssd(self):
        c = json.loads(self.cfg.read_text());c['mount']='/Volumes/nonexistent-aboboo-test';self.cfg.write_text(json.dumps(c))
        result = self.call('materials',ok=False)
        self.assertIn('SSD 未挂载',result['error'])

    def test_agent_transport_and_background_worker(self):
        requests = [dict(id=1,argv=['submit',str(self.audio),'--subtitles',str(self.subs)]),dict(id=2,argv=['rm','-rf','/']),dict(id=3,argv=['doctor']),dict(id=4,argv=['doctor','--help'])]
        p = subprocess.run([sys.executable,str(CLI),'--config',str(self.cfg),'serve'],input='\n'.join(json.dumps(r) for r in requests)+'\n',capture_output=True,text=True,timeout=10)
        replies = [json.loads(x) for x in p.stdout.splitlines()]
        self.assertEqual([r['id'] for r in replies],[1,2,3,4])
        self.assertFalse(replies[1]['ok'])
        self.assertTrue(replies[2]['ok'])
        ident = replies[0]['result']['id']
        for _ in range(100):
            result = self.call('status',ident)
            if result['status'] in ('completed','failed'):
                break
            time.sleep(.1)
        self.assertEqual(result['status'],'completed',result)


if __name__=='__main__':
    unittest.main()
