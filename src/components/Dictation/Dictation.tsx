import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { appCacheDir, join } from '@tauri-apps/api/path';
import { mkdir, writeFile, readTextFile } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';
import { audioEngine } from '../../services/audioEngine';
import { useProjectStore } from '../../stores/projectStore';
import { grade, sentences, srt, parseSrt } from '../../services/dictation';
import type { Sentence } from '../../types/project';

const button:React.CSSProperties={padding:'8px 12px',border:'1px solid #40516c',borderRadius:6,background:'#22334c',color:'#e5ecfa',cursor:'pointer'};
const stamp=(t:number)=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
export function Dictation({onBusy}:{onBusy:(busy:boolean)=>void}) {
  const {project,updateProject}=useProjectStore();
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const [language,setLanguage]=useState('en'),[playing,setPlaying]=useState(false),[repeat,setRepeat]=useState(false),[rate,setRate]=useState(1);
  const [wrongOnly,setWrongOnly]=useState(false),[hint,setHint]=useState(false),[editing,setEditing]=useState(false);
  const [reference,setReference]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState('');
  const [position,setPosition]=useState(0);const starting=useRef(false),inputRef=useRef<HTMLTextAreaElement>(null);
  const items=project?.dictation?.sentences||[], index=project?.dictation?.index||0, sentence=items[index];
  const original=project?.tracks.find(t=>t.type==='original');
  const key=project ? 'aboboo-dictation:'+project.originalAudioPath+':'+project.duration.toFixed(2) : '';
  const failure=(e:unknown)=>setError(String(e));
  const stop=()=>{audioEngine.pause();setPlaying(false);};
  useEffect(()=>{if(!project)return; if(!project.dictation){try{const stored=JSON.parse(localStorage.getItem(key)||'null');if(stored&&Array.isArray(stored.sentences)&&stored.sentences.length)updateProject({dictation:stored});}catch{/* ignore corrupt local cache */}}return ()=>{audioEngine.pause();};},[project?.id]);
  useEffect(()=>{if(project?.dictation){try{localStorage.setItem(key,JSON.stringify(project.dictation));}catch{setError('本机进度缓存空间不足，请使用“保存项目”保存进度。');}}},[project?.dictation]);
  useEffect(()=>{onBusy(busy);return()=>onBusy(false);},[busy,onBusy]);
  useEffect(()=>{setPlaying(false);setHint(false);setEditing(false);setPosition(sentence?.start||0);},[sentence?.id]);
  useEffect(()=>{if(!playing||!sentence||!original)return;const timer=setInterval(()=>{setPosition(audioEngine.getCurrentTime());if(!audioEngine.isPlaying()&&!starting.current){if(repeat){starting.current=true;audioEngine.playRange(original.id,sentence.start,sentence.end,rate).catch(failure).finally(()=>{starting.current=false;});}else setPlaying(false);}},80);return()=>clearInterval(timer);},[playing,repeat,sentence?.id,rate]);
  if(!project||!original)return null;
  const update=(changes:Partial<Sentence>)=>{if(!sentence)return;updateProject({dictation:{...project.dictation!,sentences:items.map((s,i)=>i===index?{...s,...changes}:s)}});};
  const choose=(i:number)=>{stop();updateProject({dictation:{...project.dictation!,index:i}});};
  const visible=items.map((s,i)=>({s,i})).filter(({s})=>!wrongOnly||(s.submitted&&!grade(s.text,s.answer).correct));
  const next=(direction:number)=>{const at=visible.findIndex(v=>v.i===index);const item=visible[at+direction];if(item)choose(item.i);};
  const play=async()=>{if(!sentence)return;stop();setError('');await audioEngine.playRange(original.id,sentence.start,sentence.end,rate);setPosition(sentence.start);setPlaying(true);inputRef.current?.focus();};
  const favorite=(kind:'word'|'sentence',text:string)=>{
    if(!sentence)return;const favorites=project.favorites||[];
    if(favorites.some(f=>f.kind===kind&&f.text.toLowerCase()===text.toLowerCase()&&f.start===sentence.start)){setStatus('已经在收藏中');return;}
    updateProject({favorites:[...favorites,{id:crypto.randomUUID(),kind,text,context:sentence.text,start:sentence.start,end:sentence.end,note:'',mastered:false,reviews:0}]});setStatus('已加入收藏，可在“收藏词卡”复习');
  };
  const submit=()=>{if(!sentence)return;update({submitted:true,attempts:sentence.attempts+1});};
  const transcribe=async()=>{
    setBusy(true);setError('');stop();setStatus('正在准备音频…');let unlisten:(()=>void)|undefined;
    try{
      unlisten=await listen<string>('transcription-progress',e=>setStatus(e.payload));
      const bytes=await audioEngine.exportWav(original.id);const id=crypto.randomUUID();const dir=await appCacheDir();await mkdir(dir,{recursive:true});await writeFile(await join(dir,`asr-input-${id}.wav`),bytes);
      setStatus('正在本机提取字幕…');
      const result=await invoke<Array<{start:number;end:number;text:string}>>('transcribe_audio',{id,language});
      const list=sentences(result,project.duration);if(!list.length)throw Error('没有可用的语音片段。');
      updateProject({dictation:{sentences:list,index:0,source:'Whisper small · 自动识别，允许校正'}});setWrongOnly(false);setStatus(`已生成 ${list.length} 个听写片段`);
    }catch(e){failure(e);}finally{unlisten?.();setBusy(false);}
  };
  const importSubs=async()=>{const path=await open({filters:[{name:'SRT 字幕',extensions:['srt']}],multiple:false});if(typeof path!=='string')return;const list=parseSrt(await readTextFile(path),project.duration);if(!list.length)throw Error('字幕无有效时间轴。');updateProject({dictation:{sentences:list,index:0,source:'导入字幕'}});};
  const exportSubs=async()=>{const path=await save({defaultPath:project.name+'.srt',filters:[{name:'字幕',extensions:['srt']}]});if(path)await writeFile(path,new TextEncoder().encode(srt(items)));};
  const result=sentence?.submitted?grade(sentence.text,sentence.answer):null;
  const done=items.filter(s=>s.submitted).length,correct=items.filter(s=>s.submitted&&grade(s.text,s.answer).correct).length;
  return <section style={{flex:1,minHeight:0,display:'flex',flexDirection:'column',padding:16,gap:12}} aria-label="听写练习">
    <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
      <strong>逐句听写</strong><select aria-label="识别语言" value={language} disabled={busy} onChange={e=>setLanguage(e.target.value)}><option value="en">英语</option><option value="zh">中文</option><option value="auto">自动检测</option></select>
      <button style={button} disabled={busy||items.length>0} onClick={()=>void transcribe()}>自动提取字幕</button>
      {!items.length&&<button style={button} disabled={busy} onClick={()=>importSubs().catch(failure)}>导入 SRT</button>}
      {busy&&<button style={button} onClick={()=>invoke('cancel_transcription').catch(failure)}>取消识别</button>}
      {!!items.length&&<button style={button} onClick={()=>exportSubs().catch(failure)}>导出字幕</button>}
      <span role="status" style={{color:'#a4bfdc'}}>{status}</span>
    </div>
    {error&&<div role="alert" style={{color:'#ffb4ab'}}>{error}</div>}
    {!items.length?<div style={{margin:'auto',maxWidth:600,lineHeight:1.9,color:'#b6c5da'}}>点击“自动提取字幕”，在本机识别当前音频并生成听写片段。识别完成后答案默认隐藏，先听音频、输入，再提交批改。<br/>自动字幕可能识别错词；可校正文本和起止时间，不把机器结果当作官方答案。</div>:<>
      <div style={{fontSize:13,color:'#aebed2'}}>已提交 {done}/{items.length} · 全对 {correct} · 待复习 {done-correct}　|　进度在本机自动保存；跨电脑请保存项目。</div>
      <div style={{display:'flex',gap:16,minHeight:0,flex:1}}>
        <aside style={{width:155,overflowY:'auto',flexShrink:0}}>
          <label style={{display:'block',fontSize:13,marginBottom:10}}><input type="checkbox" checked={wrongOnly} onChange={e=>setWrongOnly(e.target.checked)}/>只看错句</label>
          {visible.map(({s,i})=><button key={s.id} aria-label={`第 ${i+1} 句`} style={{...button,display:'block',width:'100%',marginBottom:5,background:i===index?'#245fa4':'#19283c'}} onClick={()=>choose(i)}>{i+1}. {stamp(s.start)} {s.submitted?(grade(s.text,s.answer).correct?'✓':'✕'):'·'}</button>)}
          {!visible.length&&<p>还没有错句。</p>}
        </aside>
        {sentence&&<main style={{flex:1,minWidth:0,overflowY:'auto',paddingRight:8}}>
          <h3 style={{marginTop:0}}>第 {index+1} 句 <small style={{fontWeight:400,color:'#9fb0c5'}}>{stamp(sentence.start)} – {stamp(sentence.end)}</small></h3>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            <button style={button} onClick={()=>play().catch(failure)}>播放本句</button><button style={button} disabled={!playing} onClick={stop}>暂停本句</button>
            <label><input type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)}/>循环本句</label>
            <select aria-label="听写速度" value={rate} onChange={e=>{stop();setRate(Number(e.target.value));}}>{[0.5,0.75,1,1.25,1.5].map(r=><option key={r} value={r}>{r}×</option>)}</select>
            <small>{stamp(position)} / {stamp(sentence.end)} · 变速会改变音调</small>
          </div>
          <textarea ref={inputRef} aria-label="听写答案" placeholder="输入你听到的内容…（⌘/Ctrl + Enter 提交；⌘/Ctrl + Space 重听）" value={sentence.answer} onChange={e=>update({answer:e.target.value,submitted:false})}
            onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();submit();}if((e.metaKey||e.ctrlKey)&&e.code==='Space'){e.preventDefault();void play();}}}
            style={{width:'100%',minHeight:120,marginTop:16,padding:14,fontSize:18,lineHeight:1.7,background:'#101c2d',color:'white',border:'1px solid #4a6688',borderRadius:8,resize:'vertical'}}/>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
            <button style={{...button,background:'#245fa4'}} onClick={submit}>提交批改</button>
            <button style={button} onClick={()=>favorite('sentence',sentence.text)}>收藏本句</button>
            <button style={button} onClick={()=>setHint(!hint)}>首字母提示</button>
            <button style={button} onClick={()=>update({revealed:!sentence.revealed})}>{sentence.revealed?'隐藏答案':'显示答案'}</button>
            <button style={button} onClick={()=>{update({answer:'',submitted:false,revealed:false});setHint(false);}}>重新听写</button>
            <button style={button} disabled={!visible.some(v=>v.i<index)} onClick={()=>next(-1)}>上一句</button><button style={button} disabled={!visible.some(v=>v.i>index)} onClick={()=>next(1)}>下一句</button>
          </div>
          {hint&&<p aria-label="提示" style={{color:'#e4c580',letterSpacing:2}}>{sentence.text.split(/\s+/).map(w=>w[0]+'＿'.repeat(Math.max(1,w.length-1))).join(' ')}</p>}
          {(sentence.revealed||sentence.submitted)&&<div style={{padding:14,background:'#1a2c42',borderRadius:8,marginTop:14}}><small>参考文本 · {project.dictation?.source}</small><p aria-label="参考答案">{sentence.text}</p></div>}
          {result&&<div aria-label="批改结果" style={{marginTop:14,lineHeight:2}}><strong>{result.correct?'全部正确':`词语准确率 ${result.score}%`}</strong><p style={{fontSize:12,color:'#abbcd1'}}>忽略大小写与标点。红色为错词，黄色为漏词，紫色为多写；按参考文本逐词比较。</p>
            {result.edits.map((e,i)=><span key={i} style={{display:'inline-block',margin:'0 5px 5px 0',padding:'1px 5px',borderRadius:4,background:e.kind==='correct'?'#174934':e.kind==='missing'?'#634d16':e.kind==='extra'?'#53346b':'#6b3038'}}>{e.kind==='correct'?e.actual:e.kind==='missing'?`漏：${e.expected}`:e.kind==='extra'?`多：${e.actual}`:`${e.actual} → ${e.expected}`}{e.expected&&e.kind!=='correct'&&<button aria-label={`收藏单词 ${e.expected}`} style={{marginLeft:5,cursor:'pointer'}} onClick={()=>favorite('word',e.expected!)}>☆</button>}</span>)}
          </div>}
          <div style={{marginTop:16}}><button style={button} onClick={()=>{stop();setEditing(!editing);setReference(sentence.text);setStart(sentence.start.toFixed(2));setEnd(sentence.end.toFixed(2));}}>校正参考文本／时间</button></div>
          {editing&&<div style={{marginTop:10}}><textarea aria-label="校正文本" value={reference} onChange={e=>setReference(e.target.value)} style={{width:'100%',minHeight:70}}/><label>起点（秒）<input aria-label="句子起点" type="number" step="0.01" value={start} onChange={e=>setStart(e.target.value)}/></label><label>终点（秒）<input aria-label="句子终点" type="number" step="0.01" value={end} onChange={e=>setEnd(e.target.value)}/></label><button style={button} onClick={()=>{const a=Number(start),b=Number(end);if(!reference.trim()||!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<=a||b>project.duration){setError('文本不能为空；起止时间需位于音频范围内。');return;}update({text:reference.trim(),start:a,end:b,submitted:false});setEditing(false);setError('');}}>保存校正</button></div>}
        </main>}
      </div>
    </>}
  </section>;
}
