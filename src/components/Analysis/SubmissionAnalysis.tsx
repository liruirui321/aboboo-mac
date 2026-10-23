import {useEffect,useMemo,useState} from 'react';
import {history,analyze,type Submission} from '../../services/submissions';
import {useProjectStore} from '../../stores/projectStore';
export function SubmissionAnalysis(){
 const project=useProjectStore(s=>s.project);const [records,setRecords]=useState<Submission[]>([]),[warnings,setWarnings]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [filter,setFilter]=useState('all'),[word,setWord]=useState(''),[unassisted,setUnassisted]=useState(false),[limit,setLimit]=useState(50);
 const refresh=async()=>{setBusy(true);setError('');try{const result=await history(project);setRecords(result.records);setWarnings(result.warnings);}catch(e){setError(String(e));}finally{setBusy(false);}};
 useEffect(()=>{void refresh();},[]);
 const selected=useMemo(()=>records.filter(r=>(filter==='all'||(filter==='first'?r.attempt===1:r.projectId===project?.libraryId||r.projectId===project?.id))&&(!unassisted||r.assisted===false)),[records,filter,project?.id,unassisted]);
 const stats=useMemo(()=>analyze(selected),[selected]);
 const rows=[...stats.timeline].reverse().filter(r=>!word||r.result.edits.some(e=>e.expected===word&&e.kind!=='correct'));
 const ranking=(kind:'missing'|'wrong')=><div className="analysis-panel"><h2>{kind==='missing'?'容易听漏／漏写':'容易听错／拼写错误'}</h2><table><thead><tr><th>词</th><th>错误 / 出现</th><th>{kind==='missing'?'漏写率':'常见误写'}</th></tr></thead><tbody>{stats.ranked.filter(w=>w[kind]>0).sort((a,b)=>b[kind]-a[kind]).slice(0,20).map(w=><tr key={w.word}><td><button onClick={()=>{setWord(w.word);setLimit(50);}}>{w.word}</button></td><td>{w[kind]} / {w.seen}</td><td>{kind==='missing'?Math.round(w.missing/w.seen*100)+'%':Object.entries(w.confusions).sort((a,b)=>b[1]-a[1]).map(([v,n])=>`${v}（${n}次）`).join('、')}</td></tr>)}</tbody></table>{!stats.ranked.some(w=>w[kind])&&<p>当前范围还没有这类错误。</p>}</div>;
 return <section className="submission-analysis" aria-label="提交轨迹分析"><header><div><h1>提交轨迹 · 智能分析</h1><p>逐次保留答案，找出反复漏写与误写的词。</p></div><button disabled={busy} onClick={()=>void refresh()}>{busy?'正在收集…':'刷新记录'}</button></header>
 {error&&<p role="alert">{error}</p>}{warnings.map((w,i)=><p key={i} role="status">{w}</p>)}
 <div className="analysis-filters"><select aria-label="分析范围" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">所有材料 · 所有提交</option><option value="first">仅首次提交</option>{project&&<option value="current">当前材料</option>}</select><label><input type="checkbox" checked={unassisted} onChange={e=>setUnassisted(e.target.checked)}/>只看未显示答案／提示的提交</label></div>
 <div className="analysis-summary"><strong>{selected.length} 条记录</strong><span>漏写 {stats.missing} 次</span><span>误写 {stats.wrong} 次</span><span>重复练习 {stats.retries} 句，其中 {stats.improved} 句较首次进步</span></div>
 <div className="analysis-panel"><h2>练习建议</h2>{!selected.length?<p>提交一次听写后，这里会出现分析。已保存的旧进度也会自动收集。</p>:<><p>{stats.missedFunctionWords.length?`优先练习弱读词：${stats.missedFunctionWords.slice(0,6).map(w=>`${w.word}（漏 ${w.missing}/${w.seen} 次）`).join('、')}。先听整句，再关注这些词与前后词的连接。`:'目前没有明显的常见功能词漏写记录。继续积累不同材料的首次提交。'}</p><p>{stats.ranked.find(w=>w.wrong)?`反复误写的词可以点击下表查看原句和实际写法，区分没听清、拼写和词形问题，再重听原句。`:'当前范围还没有误写词。'}</p></>}</div>
 <div className="analysis-columns">{ranking('missing')}{ranking('wrong')}</div>
 <div className="analysis-panel"><h2>提交轨迹{word&&` · ${word}`}</h2>{word&&<button onClick={()=>setWord('')}>查看全部记录</button>}
 {rows.slice(0,limit).map(r=><details key={r.id}><summary>{r.submittedAt?new Date(r.submittedAt).toLocaleString():'旧进度恢复 · 时间未知'} · {r.projectName} · 第 {r.attempt} 次 · {r.result.score}%{r.assisted?' · 使用过答案／提示':''}</summary><p><b>参考：</b>{r.expected}</p><p><b>你的提交：</b>{r.answer||'（空白）'}</p><p>漏写：{r.result.edits.filter(e=>e.kind==='missing').map(e=>e.expected).join('、')||'无'}；误写：{r.result.edits.filter(e=>e.kind==='wrong').map(e=>`${e.expected} → ${e.actual}`).join('、')||'无'}；多写：{r.result.edits.filter(e=>e.kind==='extra').map(e=>e.actual).join('、')||'无'}</p><small>音频位置 {r.start.toFixed(1)}–{r.end.toFixed(1)} 秒</small></details>)}{rows.length>limit&&<button onClick={()=>setLimit(limit+50)}>再显示 50 条</button>}</div>
 <p className="analysis-note">旧版本只保留最后答案和部分备份，无法还原每一次提交及其时间；恢复记录单独标记。统计按参考字幕逐词对齐，包含重试；误写可能来自听辨、拼写或参考字幕错误，不能仅凭一次提交判断原因。</p>
 </section>;
}
