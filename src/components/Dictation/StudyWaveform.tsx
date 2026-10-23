import { useMemo } from 'react';
import { audioEngine } from '../../services/audioEngine';
const time = (t:number) => `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
export function StudyWaveform({id,start,end,position,selection,onSeek,detail=false}:{id:string;start:number;end:number;position:number;selection?:{start:number;end:number};onSeek:(t:number)=>void;detail?:boolean}) {
  const peaks=useMemo(()=>audioEngine.waveform(id,start,end),[id,start,end]);
  // Mirror the same peaks around the center line, preserving their time positions.
  const shape=useMemo(()=>peaks.map((p,i)=>`${i},${28-p*25}`).join(' ')+' '+peaks.map((p,i)=>`${i},${28+p*25}`).reverse().join(' '),[peaks]);
  const ratio=(t:number)=>Math.max(0,Math.min(100,(t-start)/Math.max(.01,end-start)*100));
  return <div className={'study-wave '+(detail?'detail':'overview')}>
    <span className="wave-caption">{detail?'本句波形':'音频总览'}</span>
    <svg viewBox="0 0 1000 56" preserveAspectRatio="none" role="img" aria-label={detail?'本句音频波形':'完整音频波形'} onClick={e=>{const box=e.currentTarget.getBoundingClientRect();onSeek(start+(e.clientX-box.left)/box.width*(end-start));}}>
      {selection&&<rect x={ratio(selection.start)*10} width={Math.max(2,(ratio(selection.end)-ratio(selection.start))*10)} height="56" className="wave-selection"/>}
      <path d="M0 28H1000" className="wave-axis"/>
      <polygon points={shape} className="wave-shape"/>
      <path d={`M${ratio(position)*10} 0V56`} className="wave-cursor"/>
    </svg>
    <div className="wave-times">{[0,.25,.5,.75,1].map(r=><span key={r}>{time(start+(end-start)*r)}</span>)}</div>
  </div>;
}
