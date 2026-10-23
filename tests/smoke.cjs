const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const page=await browser.newPage(); page.setDefaultTimeout(15000); const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message)});page.on('dialog',async d=>{errors.push(d.message());await d.dismiss()});
await page.addInitScript(()=>{
const rate=8000,n=rate*8,ab=new ArrayBuffer(44+n*2),v=new DataView(ab); const str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,36+n*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*2,true);for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(i*2*Math.PI*220/rate)*1000,true);
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};window.__saved=null;window.__TAURI_INTERNALS__={transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd,args)=>{
if(cmd==='submission_list')return {records:window.__submissions||[],warnings:[]};
if(cmd==='submission_record'){if(window.__failSubmission)throw Error('Test disk unavailable');window.__submissions||=[];window.__submissions.push(args.record);return;}
if(cmd==='library_list')return Object.entries(window.__library||{}).map(([id,doc])=>({id,name:doc.name,duration:doc.duration,sentenceCount:doc.dictation.sentences.length,completed:doc.dictation.sentences.filter(s=>s.submitted).length,favorites:(doc.favorites||[]).length}));
if(cmd==='library_add'){const doc=JSON.parse(args.document);window.__library||={};window.__library[doc.id]=doc;return doc.id;}
if(cmd==='library_open')return JSON.stringify({...window.__library[args.id],libraryId:args.id});
if(cmd==='library_save_progress'){Object.assign(window.__library[args.id],args.progress);return;}

if(cmd==='plugin:event|listen')return 1;
if(cmd==='plugin:event|unlisten'||cmd==='plugin:fs|mkdir')return;
if(cmd==='plugin:path|resolve_directory')return '/tmp/aboboo-cache';
if(cmd==='plugin:path|join')return args.paths.join('/');
if(cmd==='transcribe_audio')return {segments:[{start:0,end:2,text:'The library opens at nine.'},{start:3,end:6,text:'Please bring your student card.'}],source:'Test aligned sentences'};
if(cmd==='inspect_audio_file'){if(window.__cloud)throw Error('此音频是云端占位文件');return ab.byteLength;}
if(cmd==='plugin:dialog|open')return args.options.filters[0].extensions[0]==='abmac'?'/tmp/test.abmac':'/tmp/test.wav';
if(cmd==='plugin:dialog|save')return '/tmp/test.abmac';
if(cmd==='plugin:fs|read_file')return Array.from(new Uint8Array(ab));
if(cmd==='plugin:fs|write_file'){const value=new TextDecoder().decode(args);if(!value.startsWith('RIFF'))window.__saved=value;return;}
if(cmd==='plugin:fs|read_text_file')return Array.from(new TextEncoder().encode(window.__saved));
throw Error('Unexpected IPC '+cmd);
}};
});
await page.goto(process.env.TEST_URL || 'http://127.0.0.1:1420');
await page.evaluate(()=>window.__cloud=true);
await page.getByRole('button',{name:'打开音频',exact:true}).click();await page.getByRole('alert').waitFor();
if(!(await page.getByRole('alert').innerText()).includes('云端占位'))throw Error('Missing cloud error');
await page.evaluate(()=>window.__cloud=false);
await page.getByRole('button',{name:'打开音频',exact:true}).click();await page.getByText('Original',{exact:true}).waitFor();
await page.getByRole('button',{name:'▶',exact:true}).click();await page.waitForTimeout(700);
let time=await page.evaluate(async()=> (await import('/src/stores/playerStore.ts')).usePlayerStore.getState().currentTime);if(time<0.3)throw Error('Playback not advancing');
await page.getByRole('button',{name:'⏸',exact:true}).click();
await page.getByRole('button',{name:'保存项目',exact:true}).click();await page.waitForFunction(()=>window.__saved);
let saved=await page.evaluate(()=>JSON.parse(window.__saved));if(!saved.embeddedAudio[saved.tracks[0].id])throw Error('No embedded audio');
await page.getByRole('button',{name:'打开项目',exact:true}).click();await page.waitForTimeout(300);
await page.getByRole('button',{name:'▶',exact:true}).click();await page.waitForTimeout(400);await page.getByRole('button',{name:'⏸',exact:true}).click();
await page.getByRole('button',{name:'■',exact:true}).click();
await page.getByRole('button',{name:/^A —/}).click();
await page.getByRole('button',{name:'▶',exact:true}).click();await page.waitForTimeout(600);await page.getByRole('button',{name:'⏸',exact:true}).click();
await page.getByRole('button',{name:/^B —/}).click();
const loopEnd=await page.evaluate(async()=> (await import('/src/stores/playerStore.ts')).usePlayerStore.getState().currentTime);
await page.getByRole('button',{name:'▶',exact:true}).click();await page.waitForTimeout(1400);
const loopTime=await page.evaluate(async()=> (await import('/src/stores/playerStore.ts')).usePlayerStore.getState().currentTime);
if(loopTime>loopEnd+0.15)throw Error('A–B loop failed');
await page.getByRole('button',{name:'⏸',exact:true}).click();await page.getByRole('button',{name:'A–B 循环',exact:true}).click();
await page.getByRole('button',{name:'■',exact:true}).click();await page.getByLabel('播放速度').selectOption('0.5');
await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Space');await page.waitForTimeout(800);await page.keyboard.press('Space');
const slowTime=await page.evaluate(async()=> (await import('/src/stores/playerStore.ts')).usePlayerStore.getState().currentTime);
if(slowTime<0.25||slowTime>0.65)throw Error('Rate/shortcut failed '+slowTime);
await page.getByLabel('播放速度').selectOption('0.5');
await page.getByRole('button',{name:'● 跟读录音',exact:true}).click();await page.waitForTimeout(1200);if(await page.getByLabel('播放速度').inputValue()!=='1')throw Error('Recording did not reset speed');await page.getByRole('button',{name:'■ 保存录音',exact:true}).click();await page.waitForTimeout(500);
let tracks=await page.evaluate(async()=> (await import('/src/stores/projectStore.ts')).useProjectStore.getState().project.tracks.length);if(tracks!==2)throw Error('Recording not saved: '+tracks);
await page.getByRole('button',{name:'保存项目',exact:true}).click();await page.waitForTimeout(250);await page.getByRole('button',{name:'打开项目',exact:true}).click();await page.waitForTimeout(300);
const restored=await page.evaluate(async()=> (await import('/src/stores/projectStore.ts')).useProjectStore.getState().project.tracks.length);if(restored!==2)throw Error('Recorded project not restored');

await page.getByRole('button',{name:'听写练习',exact:true}).click();
await page.getByRole('button',{name:'自动提取字幕',exact:true}).click();
await page.getByLabel('听写答案',{exact:true}).waitFor().catch(async e=>{console.error(await page.locator('body').innerText());throw e;});
if(await page.getByLabel('参考答案',{exact:true}).count())throw Error('Answer not hidden');
await page.getByRole('button',{name:'播放本句',exact:true}).click();await page.waitForTimeout(2300);
if(await page.evaluate(async()=> (await import('/src/services/audioEngine.ts')).audioEngine.isPlaying()))throw Error('Sentence did not stop');
await page.getByLabel('听写答案',{exact:true}).press('Alt+p');await page.waitForTimeout(350);
await page.getByLabel('听写答案',{exact:true}).press('Alt+p');
const paused=await page.evaluate(async()=>{const e=(await import('/src/services/audioEngine.ts')).audioEngine;return {time:e.getCurrentTime(),playing:e.isPlaying()};});
if(paused.playing||paused.time<0.2)throw Error('Pause shortcut failed');
await page.getByLabel('听写答案',{exact:true}).press('Alt+Space');
if(!(await page.locator('.sentence-controls strong').innerText()).includes('2 / 2'))throw Error('Next shortcut failed');
await page.getByLabel('听写答案',{exact:true}).press('Alt+ArrowLeft');
await page.getByLabel('听写答案',{exact:true}).press('Meta');
if(!(await page.locator('.sentence-controls strong').innerText()).includes('2 / 2'))throw Error('Command single-key next failed');
await page.getByLabel('听写答案',{exact:true}).press('Alt+ArrowLeft');
await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aboboo-command-modifier',{detail:{command:true,other:false}})));
await page.getByLabel('听写答案',{exact:true}).press('Meta');
await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aboboo-command-modifier',{detail:{command:false,other:false}})));
if(!(await page.locator('.sentence-controls strong').innerText()).includes('2 / 2'))throw Error('Native Command bridge failed');
await page.getByLabel('听写答案',{exact:true}).press('Alt+ArrowLeft');
await page.getByLabel('听写答案',{exact:true}).press('Meta+a');
if(!(await page.locator('.sentence-controls strong').innerText()).includes('1 / 2'))throw Error('Command combination changed sentence');
await page.getByLabel('听写答案',{exact:true}).fill('hello');
await page.getByLabel('听写答案',{exact:true}).press('End');
await page.getByLabel('听写答案',{exact:true}).press('Space');
if(await page.getByLabel('听写答案',{exact:true}).inputValue()!=='hello ')throw Error('Typing space was intercepted');
await page.getByLabel('听写答案',{exact:true}).press('Tab');
await page.waitForTimeout(100);
if(!await page.evaluate(async()=> (await import('/src/services/audioEngine.ts')).audioEngine.isPlaying()))throw Error('Tab replay failed');
if(!await page.getByLabel('听写答案',{exact:true}).evaluate(el=>el===document.activeElement))throw Error('Tab lost answer focus');
await page.getByLabel('听写答案',{exact:true}).press('Alt+p');

await page.getByLabel('听写答案',{exact:true}).fill('The shop opens at nine');
await page.getByLabel('听写答案',{exact:true}).press('Meta+Enter');
if(!(await page.locator('.sentence-controls strong').innerText()).includes('1 / 2'))throw Error('Command Enter advanced sentence');
if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH});
if(!(await page.getByLabel('批改结果').innerText()).includes('shop → library'))throw Error('Wrong word feedback');
await page.getByRole('button',{name:'收藏本句',exact:true}).click();
await page.getByRole('button',{name:'收藏单词 library',exact:true}).click();
await page.getByRole('button',{name:'收藏本句',exact:true}).click();
await page.getByRole('button',{name:'首字母提示',exact:true}).click();await page.getByLabel('提示',{exact:true}).waitFor();
await page.getByRole('button',{name:'下一句',exact:true}).click();
await page.getByLabel('听写答案',{exact:true}).fill('PLEASE bring your student card!');
await page.getByLabel('听写答案',{exact:true}).press('Control+Enter');
if(!(await page.getByLabel('批改结果').innerText()).includes('全部正确'))throw Error('Case punctuation grading');
await page.getByLabel('只看错句').check();
if(await page.getByRole('button',{name:'第 2 句',exact:true}).count())throw Error('Wrong filter');
await page.getByRole('button',{name:'第 1 句',exact:true}).click();
await page.getByRole('button',{name:'收藏词卡 (2)',exact:true}).click();
if((await page.getByLabel('词卡正面').innerText()).includes('library'))throw Error('Sentence card leaks answer');
await page.getByRole('button',{name:'翻面查看',exact:true}).click();
await page.getByLabel('词卡笔记').fill('图书馆开门时间');
await page.getByRole('button',{name:'已掌握',exact:true}).click();
if(!(await page.getByLabel('词卡正面').innerText()).includes('______'))throw Error('Word cloze missing');
await page.getByRole('button',{name:'翻面查看',exact:true}).click();
if(!(await page.getByLabel('词卡背面').innerText()).includes('library'))throw Error('Card back missing');
await page.getByLabel('词卡笔记').fill('图书馆');
await page.getByRole('button',{name:'再练一次',exact:true}).click();
await page.getByLabel('只复习未掌握').check();
await page.getByRole('button',{name:'翻面查看',exact:true}).click();
if(await page.getByLabel('词卡笔记').inputValue()!=='图书馆')throw Error('Card filter/notes failed');
await page.getByRole('button',{name:'保存项目',exact:true}).click();await page.waitForTimeout(200);
await page.getByRole('button',{name:'打开项目',exact:true}).click();await page.waitForTimeout(300);
const review=await page.evaluate(async()=> (await import('/src/stores/projectStore.ts')).useProjectStore.getState().project);
if(review.favorites.length!==2||!review.favorites[0].mastered||review.favorites[1].note!=='图书馆'||review.favorites[1].reviews!==1||!review.dictation.sentences[1].submitted)throw Error('Saved review state missing');
const grades=await page.evaluate(async()=>{const {grade}=await import('/src/services/dictation.ts');return [grade('one two three','one three'),grade('one two','one extra two')];});
if(!grades[0].edits.some(e=>e.kind==='missing')||!grades[1].edits.some(e=>e.kind==='extra'))throw Error('Missing/extra grading');

await page.getByRole('button',{name:'听写练习',exact:true}).click();
await page.getByLabel('听写速度').selectOption('0.5');
await page.getByRole('button',{name:'播放本句',exact:true}).click();
await page.getByRole('button',{name:'音频／跟读',exact:true}).click();
await page.getByRole('button',{name:'▶',exact:true}).click();await page.waitForTimeout(700);
const normalTime=await page.evaluate(async()=> (await import('/src/services/audioEngine.ts')).audioEngine.getCurrentTime());
if(normalTime<0.5||normalTime>1.1)throw Error('Playback rate leaked between modes '+normalTime);
await page.getByRole('button',{name:'⏸',exact:true}).click();
await page.getByRole('button',{name:'加入材料库',exact:true}).click();
await page.getByRole('button',{name:'已加入材料库',exact:true}).waitFor();
await page.getByRole('button',{name:'材料库',exact:true}).click();
await page.locator('.material-row').click();
await page.getByLabel('听写答案',{exact:true}).fill('The library opens at nine.');
await page.getByLabel('听写答案',{exact:true}).press('Control+Enter');
await page.getByRole('button',{name:'材料库',exact:true}).click();
await page.locator('.material-row').click();
if(await page.getByLabel('听写答案',{exact:true}).inputValue()!=='The library opens at nine.')throw Error('Library progress not restored');
if(!(await page.getByLabel('批改结果').innerText()).includes('全部正确'))throw Error('Library submission not restored');
if (await page.getByRole('alert').count()) throw Error(await page.getByRole('alert').innerText());
await page.getByRole('button',{name:'听写练习',exact:true}).click().catch(()=>{});
if(await page.getByLabel('听写答案',{exact:true}).count()){
 await page.getByLabel('听写答案',{exact:true}).fill('unsaved answer');
 const before=await page.evaluate(()=>window.__submissions.length);
 await page.evaluate(()=>window.__failSubmission=true);
 await page.getByRole('button',{name:'提交批改',exact:true}).click();
 await page.getByText(/提交未保存，请重试/).waitFor();
 if(await page.evaluate(()=>window.__submissions.length)!==before)throw Error('Failed submission was counted');
 await page.evaluate(()=>window.__failSubmission=false);
}
await page.getByRole('button',{name:'提交轨迹分析',exact:true}).click();
await page.getByRole('heading',{name:'提交轨迹 · 智能分析'}).waitFor();
await page.waitForFunction(()=>document.body.innerText.includes('旧版本只保留'));
const captured=await page.evaluate(()=>window.__submissions);
if(!captured.length||captured.some(r=>!r.submittedAt||r.recovered))throw Error('Submission snapshots missing');
if(!captured.some(r=>r.answer==='The shop opens at nine'))throw Error('Original wrong answer was overwritten');
const analysis=await page.evaluate(async()=>{
 const {analyze}=await import('/src/services/submissions.ts');
 const base={id:'1',projectId:'p',projectName:'p',sentenceId:'s',start:0,end:2,attempt:1,submittedAt:'2026-01-01T00:00:00Z',recovered:false,assisted:false};
 return analyze([{...base,expected:'the library opens',answer:'shop opens'},{...base,id:'2',attempt:2,submittedAt:'2026-01-02T00:00:00Z',expected:'the library opens',answer:'the library opens'}]);
});
if(analysis.missing!==1||analysis.wrong!==1||analysis.improved!==1||analysis.retries!==1)throw Error('Analysis counts or retry trend wrong');
// Resize real panels with pointer input, then verify preferences survive a reload.
await page.getByRole('button',{name:'听写练习',exact:true}).click();
if(!await page.locator('.checking-panel').count())await page.getByRole('button',{name:'显示答案',exact:true}).click();
const panelCases=[['音频总览高度','.overview','y',35],['本句波形高度','.detail','y',35],['句子列表高度','.sentence-browser','y',50],['本句词语宽度','.word-notebook','x',-60],['听写输入区高度','.writing-area','y',40],['批改区域高度','.checking-panel','y',-40]];
for(const [name,selector,axis,delta] of panelCases){
 const handle=page.getByRole('separator',{name,exact:true});await handle.scrollIntoViewIfNeeded();
 const before=await page.locator(selector).boundingBox(),box=await handle.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(box.x+box.width/2+(axis==='x'?delta:0),box.y+box.height/2+(axis==='y'?delta:0),{steps:6});await page.mouse.up();
 const after=await page.locator(selector).boundingBox();
 if((axis==='x'?after.width-before.width:after.height-before.height)<25)throw Error('Divider did not resize '+name);
}
const layout=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('aboboo-panel-size:'))));
const projectBeforeReload=await page.evaluate(async()=>(await import('/src/stores/projectStore.ts')).useProjectStore.getState().project);
await page.reload();
await page.evaluate(async project=>{window.__library={[project.id]:project};(await import('/src/stores/projectStore.ts')).useProjectStore.getState().setProject(project);},projectBeforeReload);
await page.getByRole('button',{name:'听写练习',exact:true}).click();
for(const [key,value] of Object.entries(layout)){
 const actual=await page.locator('.dictation-workspace').evaluate((el,key)=>el.style.getPropertyValue(key.replace('aboboo-panel-size:','')),key);
 if(actual!==value+'px')throw Error('Layout not restored '+key);
}
const divider=page.getByRole('separator',{name:'本句词语宽度',exact:true});await divider.focus();
const oldWidth=(await page.locator('.word-notebook').boundingBox()).width;await divider.press('ArrowLeft');
if((await page.locator('.word-notebook').boundingBox()).width<=oldWidth)throw Error('Keyboard resize failed');
await divider.dblclick();
if(await page.evaluate(()=>localStorage.getItem('aboboo-panel-size:--notebook-width'))!==null)throw Error('Double click reset failed');
await page.setViewportSize({width:800,height:600});
await page.getByRole('button',{name:'恢复布局',exact:true}).click();
await page.getByLabel('听写答案',{exact:true}).scrollIntoViewIfNeeded();
if((await page.getByLabel('听写答案',{exact:true}).boundingBox()).height<60)throw Error('Small window lost input');
if(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('aboboo-panel-size:'))))throw Error('Reset layout failed');
if((await page.evaluate(async()=>(await import('/src/stores/projectStore.ts')).useProjectStore.getState().project.dictation.sentences[0].answer))!==projectBeforeReload.dictation.sentences[0].answer)throw Error('Resizing changed practice data');
await browser.close(); console.log(JSON.stringify({passed:errors.length===0,checks:['cloud placeholder error and recovery','import WAV','play/pause','self-contained save/reopen','synthetic microphone recording','save/reopen recorded track','A–B repeat','0.5x timeline','Space shortcut','mocked ASR to hidden dictation','sentence playback boundary','word correction and missing/extra grading','wrong sentence filter','favorite deduplication','flashcard cloze/flip/notes/mastery','save and restore dictation and cards','pause/next/submit keyboard workflow','library one-click open and progress restore','all six draggable boundaries, keyboard and double-click reset, reload persistence, small window layout','immutable submission snapshots','missing/wrong analysis and retry improvement'],errors},null,2)); if(errors.length)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
