import { useEffect, useRef, useState } from 'react';

const prefix = 'aboboo-panel-size:';
export function resetPanelSizes() {
  try { Object.keys(localStorage).filter(k=>k.startsWith(prefix)).forEach(k=>localStorage.removeItem(k)); } catch {}
  window.dispatchEvent(new Event('aboboo-reset-layout'));
}

/** A keyboard-accessible divider. Dimensions are preferences, separate from practice data. */
export function ResizeBoundary({name,variable,target,axis='y',reverse=false,min=40,max=500,initial=100}: {
  name:string;variable:string;target:string;axis?:'x'|'y';reverse?:boolean;min?:number;max?:number;initial?:number;
}) {
  const handle=useRef<HTMLDivElement>(null);
  const drag=useRef<{position:number;size:number}|null>(null);
  const [value,setValue]=useState<number|undefined>(()=>{
    try { const saved=localStorage.getItem(prefix+variable); const n=Number(saved); if(saved!==null&&Number.isFinite(n))return Math.max(min,Math.min(max,n)); } catch {}
    return undefined;
  });
  const [active,setActive]=useState(false);
  const root=()=>handle.current?.closest<HTMLElement>('.dictation-workspace');
  const measured=()=>{const box=root()?.querySelector(target)?.getBoundingClientRect();return box?(axis==='x'?box.width:box.height):value??initial;};
  const limit=()=>axis==='x'?Math.max(min,Math.min(max,(root()?.clientWidth??800)-280)):max;
  const change=(n:number)=>setValue(Math.round(Math.max(min,Math.min(limit(),n))));
  useEffect(()=>{
    const el=root();
    if(value===undefined)el?.style.removeProperty(variable);else el?.style.setProperty(variable,`${value}px`);
    if(variable==='--writing-height'){if(value===undefined)el?.style.removeProperty('--writing-grow');else el?.style.setProperty('--writing-grow','0');}
    try { if(value===undefined)localStorage.removeItem(prefix+variable);else localStorage.setItem(prefix+variable,String(value)); } catch {}
  },[value,variable]);
  useEffect(()=>{
    const reset=()=>setValue(undefined);window.addEventListener('aboboo-reset-layout',reset);
    return()=>{window.removeEventListener('aboboo-reset-layout',reset);};
  },[]);
  return <div ref={handle} role="separator" tabIndex={0} aria-label={name} aria-orientation={axis==='x'?'vertical':'horizontal'}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={value??initial}
    title={`${name}：拖动调整，双击恢复；方向键微调`}
    className={`resize-boundary resize-${axis}${active?' resizing':''}`}
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={position:axis==='x'?e.clientX:e.clientY,size:measured()};setActive(true);}}
    onPointerMove={e=>{if(!drag.current)return;change(drag.current.size+((axis==='x'?e.clientX:e.clientY)-drag.current.position)*(reverse?-1:1));}}
    onPointerUp={e=>{drag.current=null;setActive(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerCancel={()=>{drag.current=null;setActive(false);}}
    onLostPointerCapture={()=>{drag.current=null;setActive(false);}}
    onDoubleClick={()=>setValue(undefined)}
    onKeyDown={e=>{
      const backward=axis==='x'?'ArrowLeft':'ArrowUp',forward=axis==='x'?'ArrowRight':'ArrowDown';
      if([backward,forward,'Home','End','Enter'].includes(e.key)){
        e.preventDefault();e.stopPropagation();
        if(e.key==='Enter')setValue(undefined);
        else if(e.key==='Home')change(min);
        else if(e.key==='End')change(limit());
        else change(measured()+(e.key===forward?1:-1)*(reverse?-1:1)*(e.shiftKey?30:10));
      }
    }}><span/></div>;
}
