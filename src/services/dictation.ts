import type { Sentence } from '../types/project';
export interface Edit { kind: 'correct'|'missing'|'extra'|'wrong'; expected?: string; actual?: string }
export function words(text:string):string[] { return text.normalize('NFKC').replace(/[’‘]/g,"'").toLowerCase().match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu)||[]; }
export function grade(expected:string,actual:string) {
  const a=words(expected),b=words(actual); const d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
  for(let i=0;i<=a.length;i++)d[i][0]=i;for(let j=0;j<=b.length;j++)d[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+Number(a[i-1]!==b[j-1]));
  const edits:Edit[]=[];let i=a.length,j=b.length;
  while(i||j){if(i&&j&&d[i][j]===d[i-1][j-1]+Number(a[i-1]!==b[j-1])){edits.push({kind:a[i-1]===b[j-1]?'correct':'wrong',expected:a[--i],actual:b[--j]});}
    else if(i&&d[i][j]===d[i-1][j]+1)edits.push({kind:'missing',expected:a[--i]});else edits.push({kind:'extra',actual:b[--j]});}
  edits.reverse();return {edits,score:Math.max(0,Math.round((1-d[a.length][b.length]/Math.max(1,a.length))*100)),correct:d[a.length][b.length]===0};
}
export function sentences(raw:Array<{start:number;end:number;text:string}>,duration:number):Sentence[]{
  const out:Sentence[]=[];
  for(const r of raw){const text=r.text.trim();if(!text||/^\[.*\]$/.test(text)||!Number.isFinite(r.start)||!Number.isFinite(r.end))continue;
    const start=Math.max(0,r.start),end=Math.min(duration,r.end);if(end<=start)continue;
    out.push({id:crypto.randomUUID(),start,end,text,answer:'',submitted:false,revealed:false,attempts:0});
  }return out;
}
export function srt(items:Sentence[]):string { const stamp=(t:number)=>{const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};return items.map((s,i)=>`${i+1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.text}\n`).join('\n'); }
export function parseSrt(text:string,duration:number):Sentence[] {const rows:Array<{start:number;end:number;text:string}>=[];const time=(s:string)=>{const p=s.replace(',','.').split(':').map(Number);return p[0]*3600+p[1]*60+p[2];};for(const block of text.replace(/\r/g,'').trim().split(/\n\s*\n/)){const lines=block.split('\n'),idx=lines.findIndex(l=>l.includes('-->'));if(idx<0)continue;const m=lines[idx].match(/(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)/);if(m)rows.push({start:time(m[1]),end:time(m[2]),text:lines.slice(idx+1).join(' ').replace(/<[^>]*>/g,'')});}return sentences(rows,duration);}
