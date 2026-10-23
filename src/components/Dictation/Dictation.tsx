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
import { StudyWaveform } from './StudyWaveform';

const stamp=(t:number)=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
export function Dictation({onBusy}:{onBusy:(busy:boolean)=>void}) {
  const {project,updateProject}=useProjectStore();
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const [language,setLanguage]=useState('en'),[playing,setPlaying]=useState(false),[repeat,setRepeat]=useState(false),[rate,setRate]=useState(1);
  const [wrongOnly,setWrongOnly]=useState(false),[hint,setHint]=useState(false),[editing,setEditing]=useState(false);
  const [reference,setReference]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState('');
  const tableRef=useRef<HTMLDivElement>(null);
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
  useEffect(()=>{
    const box=tableRef.current;if(!box)return;
    const reveal=()=>{const row=box.querySelector('tr.selected');if(!row)return;const r=row.getBoundingClientRect(),b=box.getBoundingClientRect();if(r.bottom>b.bottom)box.scrollTop+=r.bottom-b.bottom;else if(r.top<b.top+28)box.scrollTop-=b.top+28-r.top;};
    reveal();const observer=new ResizeObserver(reveal);observer.observe(box);return()=>observer.disconnect();
  },[index,wrongOnly,items.length]);
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
  const cursor=visible.findIndex(v=>v.i===index);
  const seekSentence=(t:number)=>{const target=items.findIndex(s=>t>=s.start&&t<=s.end);if(target>=0)choose(target);else if(items.length){let nearest=0;items.forEach((s,i)=>{if(Math.abs(s.start-t)<Math.abs(items[nearest].start-t))nearest=i;});choose(nearest);}};
  const detailPlay=(t:number)=>{if(!sentence)return;stop();audioEngine.playRange(original.id,Math.max(sentence.start,t),sentence.end,rate).then(()=>setPlaying(true)).catch(failure);};
  return <section className="dictation-workspace" aria-label="听写练习">
    <div className="study-toolbar">
      <strong className="study-mode">单句听写</strong>
      <select aria-label="识别语言" value={language} disabled={busy} onChange={e=>setLanguage(e.target.value)}><option value="en">英语</option><option value="zh">中文</option><option value="auto">自动检测</option></select>
      <button disabled={busy||items.length>0} onClick={()=>void transcribe()}>自动提取字幕</button>
      {!items.length&&<button disabled={busy} onClick={()=>importSubs().catch(failure)}>导入 SRT</button>}
      {busy&&<button onClick={()=>invoke('cancel_transcription').catch(failure)}>取消识别</button>}
      {!!items.length&&<button onClick={()=>exportSubs().catch(failure)}>导出字幕</button>}
      <span role="status" className="study-status">{status}</span>
      {!!items.length&&<label className="wrong-filter"><input type="checkbox" checked={wrongOnly} onChange={e=>setWrongOnly(e.target.checked)}/>只看错句</label>}
    </div>
    {error&&<div role="alert" className="study-error">{error}</div>}
    <div className="study-waves">
      <StudyWaveform id={original.id} start={0} end={project.duration} position={position} selection={sentence} onSeek={seekSentence}/>
      {sentence&&<StudyWaveform id={original.id} start={sentence.start} end={sentence.end} position={position} onSeek={detailPlay} detail/>}
    </div>
    {!items.length?<div className="dictation-empty"><span className="empty-wave">▂ ▅ ▃ ▇ ▅ ▂</span><h2>从一段音频，开始听写</h2><p>点击上方“自动提取字幕”，在本机生成听写片段。</p><p>也可以导入已有 SRT。识别后，先听原音、输入内容，再校对。</p><small>机器字幕可能有误，支持手动校正文本和时间。</small></div>:<>
      <div className="sentence-browser">
        <div className="sentence-table-wrap" ref={tableRef}>
          <table className="sentence-table"><thead><tr><th>序号</th><th>听写内容</th><th>次数</th><th>正确率</th><th>起点</th><th>句长</th></tr></thead>
            <tbody>{visible.map(({s,i})=>{const result=s.submitted?grade(s.text,s.answer):null;return <tr key={s.id} className={i===index?'selected':''} onClick={()=>choose(i)}><td><button aria-label={`第 ${i+1} 句`} onClick={e=>{e.stopPropagation();choose(i);}}>{s.submitted?(result?.correct?'☑':'☒'):'□'} <span>{i+1}</span></button></td><td className="sentence-answer">{s.answer||<span className="not-started">{i===index?'正在听写…':'待听写'}</span>}</td><td>{s.attempts||'—'}</td><td>{result?<span className="score-meter" title={`${result.score}%`}><i style={{width:result.score+'%'}}/><em>{result.score}%</em></span>:'—'}</td><td>{stamp(s.start)}</td><td>{(s.end-s.start).toFixed(1)}s</td></tr>;})}</tbody>
          </table>
          {!visible.length&&<div className="empty-rows">还没有错句。取消“只看错句”继续听写。</div>}
        </div>
        <aside className="word-notebook"><div className="panel-caption">本句词语 <small>☆ 收藏复习</small></div>
          {result&&!result.correct?result.edits.filter(e=>e.expected&&e.kind!=='correct').map((e,i)=><div className="notebook-word" key={i}><strong>{e.expected}</strong><button aria-label={`收藏单词 ${e.expected}`} title="收藏为词卡" onClick={()=>favorite('word',e.expected!)}>☆</button><small>{e.kind==='missing'?'漏写':`误写为 ${e.actual}`}</small></div>):<p className="notebook-empty">提交后在这里查看错词、漏词，点击 ☆ 加入词卡。</p>}
          <button aria-label="收藏本句" className="save-sentence" onClick={()=>favorite('sentence',sentence.text)}>☆ 收藏本句</button>
        </aside>
      </div>
      {sentence&&<>
        <div className="sentence-controls">
          <strong>第 {index+1} / {items.length} 句</strong>
          <button disabled={cursor<=0} onClick={()=>next(-1)}>上一句</button>
          <button className="play-sentence" onClick={()=>play().catch(failure)}>播放本句</button><button disabled={!playing} onClick={stop}>暂停本句</button>
          <button disabled={cursor<0||cursor>=visible.length-1} onClick={()=>next(1)}>下一句</button>
          <label><input type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)}/>循环本句</label>
          <select aria-label="听写速度" value={rate} onChange={e=>{stop();setRate(Number(e.target.value));}}>{[0.5,0.75,1,1.25,1.5].map(r=><option key={r} value={r}>{r}×</option>)}</select>
          <span className="sentence-time">{stamp(position)} / {stamp(sentence.end)} <small>变速会变调</small></span>
        </div>
        <div className="writing-area">
          <div className="writing-caption"><span>听写区</span><span>⌘/Ctrl + Enter 校对 · ⌘/Ctrl + Space 重听</span></div>
          <textarea ref={inputRef} aria-label="听写答案" spellCheck={false} placeholder="听原音，在这里写下你听到的内容…" value={sentence.answer} onChange={e=>update({answer:e.target.value,submitted:false})}
            onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();submit();}if((e.metaKey||e.ctrlKey)&&e.code==='Space'){e.preventDefault();play().catch(failure);}if(e.key==='F1'){e.preventDefault();submit();}}}/>
          {hint&&<p aria-label="提示" className="initial-hint">{sentence.text.split(/\s+/).map(w=>w[0]+'＿'.repeat(Math.max(1,w.length-1))).join(' ')}</p>}
        </div>
        <div className="checking-toolbar">
          <button className="primary" onClick={submit}>提交批改</button>
          <button onClick={()=>setHint(!hint)}>首字母提示</button>
          <button onClick={()=>update({revealed:!sentence.revealed})}>{sentence.revealed?'隐藏答案':'显示答案'}</button>
          <button onClick={()=>{update({answer:'',submitted:false,revealed:false});setHint(false);}}>重新听写</button>
          <button className="edit-reference" onClick={()=>{stop();setEditing(!editing);setReference(sentence.text);setStart(sentence.start.toFixed(2));setEnd(sentence.end.toFixed(2));}}>校正参考文本／时间</button>
        </div>
        {(sentence.revealed||sentence.submitted||editing)&&<div className="checking-panel">
          {(sentence.revealed||sentence.submitted)&&<div className="reference-line"><span>参考：</span><p aria-label="参考答案">{sentence.text}</p></div>}
          {result&&<div aria-label="批改结果" className="grading-line"><strong>{result.correct?'全部正确':`词语准确率 ${result.score}%`}</strong><div>{result.edits.map((e,i)=><span key={i} className={'edit-token '+e.kind}>{e.kind==='correct'?e.actual:e.kind==='missing'?`漏：${e.expected}`:e.kind==='extra'?`多：${e.actual}`:`${e.actual} → ${e.expected}`}</span>)}</div><small>忽略大小写与标点 · 红：错词 · 黄：漏词 · 紫：多写</small></div>}
          {editing&&<div className="reference-editor"><textarea aria-label="校正文本" value={reference} onChange={e=>setReference(e.target.value)}/><label>起点（秒）<input aria-label="句子起点" type="number" step="0.01" value={start} onChange={e=>setStart(e.target.value)}/></label><label>终点（秒）<input aria-label="句子终点" type="number" step="0.01" value={end} onChange={e=>setEnd(e.target.value)}/></label><button onClick={()=>{const a=Number(start),b=Number(end);if(!reference.trim()||!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<=a||b>project.duration){setError('文本不能为空；起止时间需位于音频范围内。');return;}update({text:reference.trim(),start:a,end:b,submitted:false});setEditing(false);setError('');}}>保存校正</button></div>}
          <div className="reference-source">{project.dictation?.source} · 可校正，不代表官方答案</div>
        </div>}
      </>}
      <footer className="study-footer"><span>已提交 {done}/{items.length}　全对 {correct}　待复习 {done-correct}</span><span>本机自动缓存 · 保存项目可备份进度与收藏</span></footer>
    </>}
  </section>;
}
