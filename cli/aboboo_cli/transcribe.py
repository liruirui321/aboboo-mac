import array,json,subprocess,wave,pathlib,sys,time
CLI=MODEL=FFMPEG=None
def process(path,out):
 if out.exists():return
 tmp=out.parent/(out.stem+'-work');tmp.mkdir(parents=True,exist_ok=True)
 wav=tmp/'input.wav'
 subprocess.run([FFMPEG,'-y','-v','error','-i',str(path),'-ar','16000','-ac','1','-c:a','pcm_s16le',str(wav)],check=True)
 with wave.open(str(wav)) as f: pcm=array.array('h',f.readframes(f.getnframes()))
 ranges=[];first=None;last=0
 for offset in range(0,len(pcm),320):
  frame=pcm[offset:offset+320];power=sum(x*x for x in frame)/len(frame)
  if power>1074:
   if first is None:first=offset
   last=offset+len(frame)
  elif first is not None and offset-last>=32000:
   ranges.append((max(0,first-16000),min(len(pcm),last+16000)));first=None
 if first is not None:ranges.append((max(0,first-16000),min(len(pcm),last+16000)))
 all=[]
 for n,(a,b) in enumerate(ranges):
  if b-a<6400:continue
  clip=tmp/f'{n}.wav';prefix=tmp/f'{n}'
  with wave.open(str(clip),'w') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(pcm[a:b].tobytes()+bytes(32000))
  with open(tmp/f'{n}.log','w') as log:subprocess.run([CLI,'-m',MODEL,'-f',str(clip),'-l','en','-mc','0','-oj','-ml','1','-sow','-of',str(prefix)],stdout=log,stderr=log,check=True)
  for s in json.load(open(prefix.with_suffix('.json')))['transcription']:
   text=s['text'].strip();start=s['offsets']['from']/1000+a/16000;end=min(s['offsets']['to']/1000+a/16000,b/16000)
   if text and not(text.startswith('[') and text.endswith(']')) and end>=start:all.append({'start':start,'end':end,'text':text})
 pending=out.with_suffix('.partial.json')
 pending.write_text(json.dumps({'path':str(path),'duration':len(pcm)/16000,'words':all},ensure_ascii=False));pending.replace(out);print(path.name,len(all),'words',flush=True)
 import shutil
 def cleanup_error(func,path,exc):
  if not isinstance(exc[1],FileNotFoundError):raise exc[1]
 shutil.rmtree(tmp,onerror=cleanup_error)
if __name__=='__main__':
 CLI,MODEL,FFMPEG=sys.argv[3:6]
 process(pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]))
