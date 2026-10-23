import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './MaterialLibrary.css';
interface Material {id:string;name:string;duration:number;sentenceCount:number;completed:number;favorites:number}
function category(name:string){
 const book=name.match(/(?:剑桥(?:雅思)?|剑雅|Cambridge(?:\s+IELTS)?)\s*(\d+)|IELTS\s*(\d+)/i);
 const kind=/机经/.test(name)?'recalled':book?'cambridge':'other';
 const month=name.match(/20\d{2}[-.]\d{1,2}/)?.[0].replace('.','-')||'';
 const group=kind==='cambridge'?`剑雅 ${book?.[1]||book?.[2]}`:kind==='recalled'?month:'';
 const test=name.match(/Test\s*(\d+)/i)?.[1];
 const recalledSet=name.match(/·\s*(\d+)\s*·/)?.[1];
 return {kind,group,set:test?`Test ${test}`:recalledSet?`第 ${recalledSet} 套`:'',part:name.match(/Part\s*(\d+)/i)?.[1]||''};
}
export function MaterialLibrary({onOpen}:{onOpen:(id:string)=>Promise<void>}){
 const [items,setItems]=useState<Material[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[opening,setOpening]=useState(''),[search,setSearch]=useState('');
 const [kind,setKind]=useState(''),[group,setGroup]=useState(''),[set,setSet]=useState(''),[part,setPart]=useState('');
 const refresh=()=>{setError('');setLoading(true);invoke<Material[]>('library_list').then(setItems).catch(e=>setError(String(e))).finally(()=>setLoading(false));};
 useEffect(refresh,[]);
 const tagged=items.map(item=>({item,...category(item.name)}));
 const inKind=tagged.filter(m=>!kind||m.kind===kind);
 const groups=[...new Set(inKind.map(m=>m.group).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 const inGroup=inKind.filter(m=>!group||m.group===group);
 const sets=[...new Set(inGroup.map(m=>m.set).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 const shown=inGroup.filter(m=>(!set||m.set===set)&&(!part||m.part===part)&&m.item.name.toLowerCase().includes(search.trim().toLowerCase()));
 return <section className="material-library" aria-label="听写材料库"><header><div><h1>听写材料库</h1><p>选择一份材料，接着上次的进度练习。</p></div><button onClick={refresh} disabled={loading||!!opening}>刷新材料</button></header>
 <div className="library-filter">
 <select aria-label="材料类型" value={kind} onChange={e=>{setKind(e.target.value);setGroup('');setSet('');}}><option value="">全部类型</option><option value="recalled">机经</option><option value="cambridge">剑雅</option><option value="other">其他材料</option></select>
 <select aria-label="册数或月份" value={group} onChange={e=>{setGroup(e.target.value);setSet('');}}><option value="">{kind==='cambridge'?'全部册数':kind==='recalled'?'全部月份':'全部册数／月份'}</option>{groups.map(g=><option key={g} value={g}>{g}</option>)}</select>
 <select aria-label="套题" value={set} onChange={e=>setSet(e.target.value)}><option value="">全部套题</option>{sets.map(s=><option key={s} value={s}>{s}</option>)}</select>
 <select aria-label="听力部分" value={part} onChange={e=>setPart(e.target.value)}><option value="">全部 Part</option>{[1,2,3,4].map(p=><option key={p} value={p}>Part {p}</option>)}</select>
 <input aria-label="搜索材料" placeholder="搜索材料标题…" value={search} onChange={e=>setSearch(e.target.value)}/>
 {(kind||group||set||part||search)&&<button onClick={()=>{setKind('');setGroup('');setSet('');setPart('');setSearch('');}}>清除筛选</button>}
 </div>
 {error&&<p role="alert">{error}</p>}{loading?<p>正在读取材料…</p>:!items.length?<p>材料库还是空的。打开音频、提取字幕后，点击顶部“加入材料库”。</p>:!shown.length?<p>没有匹配的材料，请调整筛选条件。</p>:<div className="library-list">{shown.map(({item:m})=><button className="material-row" key={m.id} title={m.name} disabled={!!opening} onClick={()=>{setError('');setOpening(m.id);onOpen(m.id).catch(e=>setError(String(e))).finally(()=>setOpening(''));}}><span className="material-icon" aria-hidden="true">♫</span><span className="material-name"><strong>{m.name}</strong></span><span className="material-duration">{Math.floor(m.duration/60)}:{String(Math.floor(m.duration%60)).padStart(2,'0')}</span><span className="material-action">{opening===m.id?'正在打开…':m.completed?'继续听写 →':'开始听写 →'}</span></button>)}</div>}
 <p className="library-tip">已准备的材料可直接听写。进度和收藏自动保存到本机；“保存项目”可导出备份。</p></section>;
}
