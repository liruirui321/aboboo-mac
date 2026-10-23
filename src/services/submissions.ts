import { invoke } from '@tauri-apps/api/core';
import { grade, words } from './dictation';
import type { Project, Sentence } from '../types/project';
export interface Submission {id:string;projectId:string;projectName:string;sentenceId:string;start:number;end:number;expected:string;answer:string;attempt:number;submittedAt:string|null;recovered:boolean;assisted:boolean|null}
export const snapshot=(p:Project)=>({id:p.libraryId||p.id,name:p.name,dictation:p.dictation,dictationBackups:p.dictationBackups});
export const history=(p?:Project|null)=>invoke<{records:Submission[];warnings:string[]}>('submission_list',{project:p?snapshot(p):null});
export async function record(p:Project,s:Sentence,assisted:boolean){
 const submission:Submission={id:crypto.randomUUID(),projectId:p.libraryId||p.id,projectName:p.name,sentenceId:s.id,start:s.start,end:s.end,expected:s.text,answer:s.answer,attempt:s.attempts+1,submittedAt:new Date().toISOString(),recovered:false,assisted};
 await invoke('submission_record',{record:submission});return submission;
}
export function analyze(records:Submission[]){
 const counts=new Map<string,{word:string;seen:number;missing:number;wrong:number;correct:number;confusions:Record<string,number>}>();
 const timeline=records.map(r=>({...r,result:grade(r.expected,r.answer)}));
 for(const r of timeline)for(const e of r.result.edits){if(!e.expected)continue;let v=counts.get(e.expected);if(!v){v={word:e.expected,seen:0,missing:0,wrong:0,correct:0,confusions:{}};counts.set(e.expected,v);}v.seen++;if(e.kind==='missing')v.missing++;if(e.kind==='wrong'){v.wrong++;v.confusions[e.actual||'']=(v.confusions[e.actual||'']||0)+1;}if(e.kind==='correct')v.correct++;}
 const ranked=[...counts.values()].sort((a,b)=>(b.missing+b.wrong)-(a.missing+a.wrong)||b.seen-a.seen||a.word.localeCompare(b.word));
 const dated=timeline.filter(r=>r.submittedAt&&!r.recovered).sort((a,b)=>a.submittedAt!.localeCompare(b.submittedAt!));
 const groups=new Map<string,typeof dated>();for(const r of dated){const key=JSON.stringify([r.projectId,r.sentenceId,r.expected]);groups.set(key,[...(groups.get(key)||[]),r]);}
 const retries=[...groups.values()].filter(g=>g.length>1);const improved=retries.filter(g=>g[g.length-1].result.score>g[0].result.score).length;
 const functionWords=new Set(words('a an the to of in on at for and or but is are was were be been have has had do does did can could would should it its that this these those as by from with not'));
 const missedFunctionWords=ranked.filter(w=>functionWords.has(w.word)&&w.missing>0);
 return {ranked,timeline,dated,retries:retries.length,improved,missedFunctionWords,missing:ranked.reduce((n,w)=>n+w.missing,0),wrong:ranked.reduce((n,w)=>n+w.wrong,0)};
}
