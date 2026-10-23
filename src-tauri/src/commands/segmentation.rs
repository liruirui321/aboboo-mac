use serde::{Deserialize,Serialize};
use std::{fs,path::Path,process::{Command,Stdio},sync::atomic::{AtomicBool,Ordering},time::{Duration,Instant}};
#[derive(Clone,Debug,Serialize,Deserialize)]
pub struct Segment{pub start:f64,pub end:f64,pub text:String}
#[derive(Serialize,Deserialize)]
pub struct Segmentation{pub segments:Vec<Segment>,pub words:Vec<Segment>,pub source:String}
fn terminal(text:&str)->bool{
 let t=text.trim_end_matches(['"','\'','”','’',')',']']);
 if t.ends_with(['!','?','。','！','？']){return true;}
 if !t.ends_with('.') {return false;}
 let word=t.split_whitespace().last().unwrap_or("").to_lowercase();
 if ["mr.","mrs.","ms.","dr.","prof.","st.","vs.","e.g.","i.e.","etc."].contains(&word.as_str()){return false;}
 if word.len()==2&&word.chars().next().is_some_and(|c|c.is_alphabetic()){return false;}
 true
}
fn sentence(words:&[Segment])->Segment{Segment{start:words[0].start,end:words.last().unwrap().end,text:words.iter().map(|s|s.text.trim()).collect::<Vec<_>>().join(" ").replace(" ,",",").replace(" .",".").replace(" ?","?").replace(" !","!")}}
pub fn punctuation(words:&[Segment])->Vec<Segment>{
 let mut out=Vec::new();let mut first=0;
 for (i,w) in words.iter().enumerate(){
  let gap=words.get(i+1).is_some_and(|next|next.start-w.end>2.0);
  if terminal(&w.text)||gap||i+1==words.len(){out.push(sentence(&words[first..=i]));first=i+1;}
 }out
}
// The model returns only boundary IDs: it cannot rewrite or remove transcript words.
fn aligned_boundaries(candidates:&[Segment],output:&str)->Option<Vec<Segment>>{
 let a=output.find('[')?;let b=output[a..].find(']')?+a;
 let ids:Vec<usize>=serde_json::from_str(&output[a..=b]).ok()?;
 if ids.is_empty()||ids.iter().any(|&n|n==0||n>candidates.len())||ids.windows(2).any(|w|w[0]>=w[1]){return None;}
 let mut out=Vec::new();let mut start=0;
 for (i,c) in candidates.iter().enumerate(){
  if ids.contains(&(i+1))||terminal(&c.text)||i+1==candidates.len(){out.push(sentence(&candidates[start..=i]));start=i+1;}
 }Some(out)
}
pub fn segment_words<F:Fn(String)>(words:Vec<Segment>,resources:&Path,work:&Path,cancel:&AtomicBool,progress:F)->Result<Segmentation,String>{
 if words.is_empty(){return Err("没有可分句的文字".into());}
 let cli=resources.join("llama-completion");let model=resources.join("qwen.gguf");
 let mut out=Vec::new();let mut accepted=0;let mut total=0;let mut start=0;
 while start<words.len(){
  if cancel.load(Ordering::SeqCst){return Err("识别已取消。".into());}
  let mut end=(start+180).min(words.len());while end<words.len()&&!terminal(&words[end-1].text){end+=1;}
  let slice=&words[start..end];total+=1;progress(format!("正在进行 LLM 单句拆分：第 {total} 组…"));
  let generated=(||->Result<Vec<Segment>,String>{
   if !cli.is_file()||!model.is_file(){return Err("LLM 组件缺失".into());}
   let candidates=punctuation(slice);
   let numbered=candidates.iter().enumerate().map(|(i,s)|format!("{}: {}",i+1,s.text)).collect::<Vec<_>>().join("\n");
   let prompt=format!("<|im_start|>system\nYou detect complete sentence boundaries. Given numbered transcript lines, return a JSON array of line numbers where a full sentence ends. Merge unfinished phrases with the following line. Always include the final line number. Do not output text or explanations.\nExample: 1: We went\n2: home.\n3: It was late.\nAnswer: [2,3]<|im_end|>\n<|im_start|>user\n{numbered}<|im_end|>\n<|im_start|>assistant\n");
   let input=work.join("sentence-prompt.txt");let output=work.join("sentence-result.txt");fs::write(&input,prompt).map_err(|e|e.to_string())?;
   let file=fs::File::create(&output).map_err(|e|e.to_string())?;
   let mut child=Command::new(&cli).arg("-m").arg(&model).arg("-f").arg(&input).args(["-n","256","-c","4096","--temp","0","--no-conversation","--no-display-prompt","--no-perf","--simple-io"])
    .stdout(Stdio::from(file)).stderr(Stdio::null()).spawn().map_err(|e|e.to_string())?;
   let began=Instant::now();let status=loop{if cancel.load(Ordering::SeqCst)||began.elapsed()>Duration::from_secs(150){let _=child.kill();let _=child.wait();return Err("分句取消或超时".into());}match child.try_wait().map_err(|e|e.to_string())?{Some(s)=>break s,None=>std::thread::sleep(Duration::from_millis(80))}};
   if !status.success(){return Err("模型执行失败".into());}
   let text=fs::read_to_string(output).map_err(|e|e.to_string())?;
   aligned_boundaries(&candidates,&text).ok_or("模型边界无效，使用标点边界保护原音对齐".into())
  })();
  if cancel.load(Ordering::SeqCst){return Err("识别已取消。".into());}
  match generated{Ok(sentences)=>{accepted+=1;out.extend(sentences);},Err(_)=>out.extend(punctuation(slice))}
  start=end;
 }
 // Add a small listening margin, bounded by neighboring sentences to avoid overlap.
 for i in 0..out.len(){let prev=if i>0{out[i-1].end}else{0.0};out[i].start=(out[i].start-0.08).max(prev);let next=out.get(i+1).map_or(out[i].end+0.12,|s|s.start);out[i].end=(out[i].end+0.12).min(next).max(out[i].start+0.01);}
 Ok(Segmentation{segments:out,words,source:if accepted==total{format!("Whisper 词级对齐 · Qwen LLM 单句拆分（{total} 组已校验）")}else{format!("Whisper 词级对齐 · Qwen LLM {accepted}/{total} 组通过；{} 组按标点回退",total-accepted)}})
}
#[cfg(test)]mod tests{use super::*;fn sample()->Vec<Segment>{["Dr.","Brown","is","here.","He","can","help."].iter().enumerate().map(|(i,t)|Segment{start:i as f64,end:i as f64+0.5,text:t.to_string()}).collect()}
 #[test]fn abbreviation_and_sentence_boundary(){let s=punctuation(&sample());assert_eq!(s.len(),2);assert_eq!(s[0].text,"Dr. Brown is here.");assert_eq!(s[1].start,4.0);}
 #[test]fn reject_invalid_boundaries(){let c=punctuation(&sample());assert!(aligned_boundaries(&c,"[1,9]").is_none());assert!(aligned_boundaries(&c,"[2,1]").is_none());}
 #[test]fn align_complete_sentences(){let c=punctuation(&sample());let s=aligned_boundaries(&c,"[1,2]").unwrap();assert_eq!(s.len(),2);assert_eq!(s[0].end,3.5);assert_eq!(s[1].text,"He can help.");}
}
