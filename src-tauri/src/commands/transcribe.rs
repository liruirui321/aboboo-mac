use serde::Serialize;
use std::{fs, process::{Command, Stdio}, sync::atomic::{AtomicBool, Ordering}, time::{Duration, Instant}};
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct AsrState { running: AtomicBool, cancel: AtomicBool }
#[derive(Serialize)]
pub struct Segment { start: f64, end: f64, text: String }

#[tauri::command]
pub fn cancel_transcription(app: tauri::AppHandle) { app.state::<AsrState>().cancel.store(true, Ordering::SeqCst); }

// Input is the fixed mono 16 kHz PCM16 WAV produced by our audio engine.
fn spans(wav: &[u8]) -> Result<Vec<(usize, usize)>, String> {
    if wav.len() < 46 || &wav[0..4] != b"RIFF" || &wav[8..12] != b"WAVE" || &wav[36..40] != b"data"
        || wav[20..24] != [1,0,1,0] || wav[24..28] != 16000u32.to_le_bytes() || wav[34..36] != [16,0] {
        return Err("音频预处理格式无效，请重新打开音频。".into());
    }
    let pcm = &wav[44..]; let count = pcm.len()/2;
    let mut ranges = Vec::new(); let mut first = None; let mut last = 0;
    for offset in (0..count).step_by(320) {
        let end = (offset+320).min(count);
        let power: f64 = (offset..end).map(|i| { let s=i16::from_le_bytes([pcm[i*2],pcm[i*2+1]]) as f64; s*s }).sum::<f64>() / (end-offset) as f64;
        if power > 1074.0 { // RMS > 0.001 of full scale
            if first.is_none() { first=Some(offset); } last=end;
        } else if first.is_some() && offset.saturating_sub(last) >= 32000 {
            ranges.push((first.take().unwrap().saturating_sub(4000),(last+4000).min(count)));
        }
    }
    if let Some(start)=first { ranges.push((start.saturating_sub(4000),(last+4000).min(count))); }
    ranges.retain(|(a,b)| b-a >= 6400);
    if ranges.is_empty() { return Err("没有检测到可识别的语音，请检查音频音量。".into()); }
    Ok(ranges)
}

fn recognize(app: &tauri::AppHandle, id: &str, language: &str) -> Result<Vec<Segment>,String> {
    let state=app.state::<AsrState>();
    let cache=app.path().app_cache_dir().map_err(|e|e.to_string())?;
    let input=cache.join(format!("asr-input-{id}.wav"));
    let dir=cache.join(format!("asr-work-{id}"));
    let result=(|| {
        let size=fs::metadata(&input).map_err(|e|e.to_string())?.len();
        if size>230_400_044 { return Err("单次识别暂限两小时音频。".into()); }
        let wav=fs::read(&input).map_err(|e|e.to_string())?;
        let ranges=spans(&wav)?;
        fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
        let resources=app.path().resource_dir().map_err(|e|e.to_string())?.join("resources/asr");
        let cli=resources.join("whisper-cli"); let model=resources.join("model.bin");
        if !cli.is_file() || !model.is_file() { return Err("离线识别组件缺失，请安装包含语音模型的完整应用包。".into()); }
        let mut all=Vec::new();
        for (n,(start,end)) in ranges.iter().enumerate() {
            if state.cancel.load(Ordering::SeqCst) { return Err("识别已取消。".into()); }
            let _=app.emit("transcription-progress",format!("正在识别语音片段 {}/{}…",n+1,ranges.len()));
            let audio=dir.join(format!("{n}.wav")); let output=dir.join(format!("{n}"));
            let mut clip=wav[..44].to_vec(); let len=((end-start)*2) as u32;
            clip[4..8].copy_from_slice(&(len+36).to_le_bytes()); clip[40..44].copy_from_slice(&len.to_le_bytes());
            clip.extend_from_slice(&wav[44+start*2..44+end*2]); fs::write(&audio,clip).map_err(|e|e.to_string())?;
            let log=fs::File::create(dir.join(format!("{n}.log"))).map_err(|e|e.to_string())?;
            let mut child=Command::new(&cli).args(["-m"]).arg(&model).arg("-f").arg(&audio)
                .args(["-l",language,"-mc","0","-oj","-ml","100","-sow","-of"]).arg(&output)
                .stdout(Stdio::null()).stderr(Stdio::from(log)).spawn().map_err(|e|format!("无法启动离线识别：{e}"))?;
            let began=Instant::now();
            let status=loop {
                if state.cancel.load(Ordering::SeqCst) || began.elapsed()>Duration::from_secs(1800) {
                    let _=child.kill(); let _=child.wait(); return Err("识别已取消或超时。".into());
                }
                match child.try_wait().map_err(|e|e.to_string())? { Some(s)=>break s, None=>std::thread::sleep(Duration::from_millis(100)) }
            };
            if !status.success() { return Err("离线识别失败，请检查内存空间后重试。".into()); }
            let json:serde_json::Value=serde_json::from_slice(&fs::read(output.with_extension("json")).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
            let segments=json["transcription"].as_array().ok_or("识别结果无效")?;
            for s in segments {
                let text=s["text"].as_str().unwrap_or("").trim();
                if text.is_empty() || (text.starts_with('[')&&text.ends_with(']')) { continue; }
                let begin=s["offsets"]["from"].as_f64().unwrap_or(0.0)/1000.0 + *start as f64/16000.0;
                let finish=(s["offsets"]["to"].as_f64().unwrap_or(0.0)/1000.0 + *start as f64/16000.0).min(*end as f64/16000.0);
                if finish>begin { all.push(Segment{start:begin,end:finish,text:text.to_string()}); }
            }
        }
        if all.is_empty() {return Err("没有识别到文本，请换一种识别语言或检查音频。".into());}
        Ok(all)
    })();
    let _=fs::remove_file(input); let _=fs::remove_dir_all(dir); result
}

#[tauri::command]
pub async fn transcribe_audio(app: tauri::AppHandle, id: String, language: String) -> Result<Vec<Segment>,String> {
    uuid::Uuid::parse_str(&id).map_err(|_|"识别任务编号无效")?;
    if !["en","zh","auto"].contains(&language.as_str()) { return Err("识别语言无效".into()); }
    let state=app.state::<AsrState>();
    if state.running.swap(true,Ordering::SeqCst) { return Err("另一个识别任务正在进行。".into()); }
    state.cancel.store(false,Ordering::SeqCst); drop(state);
    let worker=app.clone();
    let result=tauri::async_runtime::spawn_blocking(move || recognize(&worker,&id,&language)).await;
    app.state::<AsrState>().running.store(false,Ordering::SeqCst);
    result.map_err(|e|format!("识别任务失败：{e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn silence_is_not_transcribed() { let mut wav=vec![0u8;44+16000*2*5]; wav[..4].copy_from_slice(b"RIFF");wav[8..12].copy_from_slice(b"WAVE");wav[36..40].copy_from_slice(b"data");wav[20..24].copy_from_slice(&[1,0,1,0]);wav[24..28].copy_from_slice(&16000u32.to_le_bytes());wav[34..36].copy_from_slice(&[16,0]);assert!(spans(&wav).is_err()); }
}
