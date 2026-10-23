import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
interface Material {id:string;name:string;duration:number;sentenceCount:number;completed:number;favorites:number}
export function MaterialLibrary({onOpen}:{onOpen:(id:string)=>Promise<void>}){
 const [items,setItems]=useState<Material[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[opening,setOpening]=useState(''),[search,setSearch]=useState('');
 const refresh=()=>{setLoading(true);invoke<Material[]>('library_list').then(setItems).catch(e=>setError(String(e))).finally(()=>setLoading(false));};
 useEffect(refresh,[]);
 return <section className="material-library" aria-label="听写材料库"><header><div><h1>听写材料库</h1><p>选择一份材料，接着上次的进度练习。</p></div><button onClick={refresh} disabled={loading||!!opening}>刷新材料</button></header>
 <div className="library-filter"><input aria-label="搜索材料" placeholder="搜索：剑桥 15、Test 1、Part 4…" value={search} onChange={e=>setSearch(e.target.value)}/><span>{items.length} 份材料 · {items.reduce((n,m)=>n+m.sentenceCount,0)} 个句子</span></div>
 {error&&<p role="alert">{error}</p>}{loading?<p>正在读取材料…</p>:!items.length?<p>材料库还是空的。打开音频、提取字幕后，点击顶部“加入材料库”。</p>:<div className="library-list">{items.filter(m=>m.name.toLowerCase().includes(search.toLowerCase())).map(m=><button className="material-row" key={m.id} disabled={!!opening} onClick={()=>{setOpening(m.id);onOpen(m.id).catch(e=>setError(String(e))).finally(()=>setOpening(''));}}><span className="material-icon">♫</span><span className="material-name"><strong>{m.name}</strong><small>{Math.floor(m.duration/60)}:{String(Math.floor(m.duration%60)).padStart(2,'0')}　·　{m.sentenceCount} 句　·　收藏 {m.favorites||0}</small></span><span className="material-progress">已听写 {m.completed||0}/{m.sentenceCount}<progress max={Math.max(1,m.sentenceCount)} value={m.completed||0}/></span><span className="material-action">{opening===m.id?'正在打开…':m.completed?'继续听写 →':'开始听写 →'}</span></button>)}</div>}
 <p className="library-tip">已准备的材料可直接听写。进度和收藏自动保存到本机；“保存项目”可导出备份。</p></section>;
}
