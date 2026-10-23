import { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { audioEngine } from '../../services/audioEngine';
import { words } from '../../services/dictation';
import type { Favorite } from '../../types/project';
const btn:React.CSSProperties={padding:'9px 16px',background:'#263c58',border:'1px solid #46617f',borderRadius:7,color:'white',cursor:'pointer'};
export function Favorites(){
  const {project,updateProject}=useProjectStore();const [index,setIndex]=useState(0),[flipped,setFlipped]=useState(false),[onlyNew,setOnlyNew]=useState(false),[error,setError]=useState('');
  const all=project?.favorites||[], cards=all.filter(c=>!onlyNew||!c.mastered),card=cards[Math.min(index,Math.max(0,cards.length-1))];
  useEffect(()=>{setFlipped(false);audioEngine.pause();},[card?.id]);useEffect(()=>()=>audioEngine.pause(),[]);
  if(!project)return null;const original=project.tracks.find(t=>t.type==='original');
  const update=(changes:Partial<Favorite>)=>{if(card)updateProject({favorites:all.map(f=>f.id===card.id?{...f,...changes}:f)});};
  const move=(n:number)=>{setFlipped(false);audioEngine.pause();setIndex(i=>(i+n+cards.length)%cards.length);};
  const review=(mastered:boolean)=>{update({mastered,reviews:card.reviews+1});setFlipped(false);audioEngine.pause();if(!onlyNew||!mastered)move(1);};
  const play=()=>{if(original&&card)audioEngine.playRange(original.id,card.start,card.end,1).catch(e=>setError(String(e)));};
  const masked=card?.kind==='word'?card.context.replace(/[\p{L}\p{N}]+(?:['’‘][\p{L}\p{N}]+)*/gu,token=>words(token)[0]===words(card.text)[0]?'______':token):'先听音频，回忆这句话的内容';
  return <section style={{flex:1,minHeight:0,overflowY:'auto',padding:24}} aria-label="收藏词卡">
    <h2>收藏词卡 <small style={{fontWeight:400,fontSize:14}}>当前项目 {all.length} 张 · 已掌握 {all.filter(c=>c.mastered).length}</small></h2>
    <label><input type="checkbox" checked={onlyNew} onChange={e=>{setOnlyNew(e.target.checked);setIndex(0);}}/>只复习未掌握</label>
    {error&&<p role="alert">{error}</p>}
    {!card?<p style={{padding:40,color:'#aabbcf'}}>暂无待复习词卡。在听写中点击“收藏本句”，或点击错词旁的 ☆。</p>:<div style={{maxWidth:760,margin:'24px auto'}}>
      <div style={{color:'#acbfd6',marginBottom:12}}>第 {Math.min(index,cards.length-1)+1} / {cards.length} 张 · {card.kind==='word'?'单词卡':'句子卡'} · 已复习 {card.reviews} 次</div>
      <div style={{background:'#182b43',padding:28,borderRadius:14,minHeight:200,border:'1px solid #405d80'}}>
        <button style={btn} onClick={play}>播放词卡音频</button>
        {!flipped?<><h3>听音回忆，再翻面查看</h3><p aria-label="词卡正面" style={{fontSize:22,lineHeight:1.8}}>{masked}</p></>:<div aria-label="词卡背面"><h2 style={{color:'#83c7ff'}}>{card.text}</h2>{card.kind==='word'&&<p style={{lineHeight:1.8}}>{card.context}</p>}<label>释义／笔记<textarea aria-label="词卡笔记" value={card.note} onChange={e=>update({note:e.target.value})} placeholder="记下中文释义、搭配或易错点…" style={{display:'block',width:'100%',padding:10,marginTop:8,minHeight:70}}/></label></div>}
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:16}}>
        <button style={btn} onClick={()=>move(-1)}>上一张</button><button style={{...btn,background:'#245fa4'}} onClick={()=>setFlipped(!flipped)}>{flipped?'盖住答案':'翻面查看'}</button><button style={btn} onClick={()=>move(1)}>下一张</button>
        {flipped&&<><button style={btn} onClick={()=>review(false)}>再练一次</button><button style={{...btn,background:'#227253'}} onClick={()=>review(true)}>已掌握</button></>}
        <button style={btn} onClick={()=>{audioEngine.pause();updateProject({favorites:all.filter(f=>f.id!==card.id)});setFlipped(false);}}>取消收藏</button>
      </div>
      <p style={{fontSize:13,color:'#9cb1cc'}}>词卡保留原音频片段。笔记、收藏和掌握状态随项目保存；本机也会自动缓存。</p>
    </div>}
  </section>;
}
