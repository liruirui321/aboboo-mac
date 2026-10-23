const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message)});page.on('dialog',async d=>{errors.push(d.message());await d.dismiss()});
await page.addInitScript(()=>{
const rate=8000,n=rate*8,ab=new ArrayBuffer(44+n*2),v=new DataView(ab); const str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,36+n*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*2,true);for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(i*2*Math.PI*220/rate)*1000,true);
window.__saved=null;window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{
if(cmd==='plugin:dialog|open')return args.options.filters[0].extensions[0]==='abmac'?'/tmp/test.abmac':'/tmp/test.wav';
if(cmd==='plugin:dialog|save')return '/tmp/test.abmac';
if(cmd==='plugin:fs|read_file')return Array.from(new Uint8Array(ab));
if(cmd==='plugin:fs|write_file'){window.__saved=new TextDecoder().decode(args);return;}
if(cmd==='plugin:fs|read_text_file')return Array.from(new TextEncoder().encode(window.__saved));
throw Error('Unexpected IPC '+cmd);
}};
});
await page.goto('http://127.0.0.1:1420');
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
if (await page.getByRole('alert').count()) throw Error(await page.getByRole('alert').innerText());
await browser.close(); console.log(JSON.stringify({passed:errors.length===0,checks:['import WAV','play/pause','self-contained save/reopen','synthetic microphone recording','save/reopen recorded track','A–B repeat','0.5x timeline','Space shortcut'],errors},null,2)); if(errors.length)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
