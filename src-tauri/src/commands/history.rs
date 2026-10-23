use serde_json::{json,Value};
use std::{fs,path::Path,collections::HashSet,hash::{Hash,Hasher},io::Write};
use tauri::Manager;
fn read(p:&Path)->Result<Value,String>{serde_json::from_slice(&fs::read(p).map_err(|e|e.to_string())?).map_err(|e|e.to_string())}
fn fingerprint(r:&Value)->String {
 let mut h=std::collections::hash_map::DefaultHasher::new();
 for k in ["projectId","expected","answer"] {r[k].to_string().hash(&mut h);}
 r["start"].as_f64().unwrap_or(0.0).to_bits().hash(&mut h);r["attempt"].as_u64().unwrap_or(0).hash(&mut h);
 format!("{:016x}",h.finish())
}
fn store(dir:&Path,record:&Value)->Result<(),String>{
 let id=record["id"].as_str().ok_or("提交编号缺失")?;
 if id.len()>80||!id.chars().all(|c|c.is_ascii_alphanumeric()||c=='-'){return Err("提交编号无效".into());}
 let path=dir.join(format!("{id}.json"));
 if path.exists(){if read(&path)?==*record{return Ok(());}return Err("提交编号冲突".into());}
 let tmp=dir.join(format!("{}.tmp",uuid::Uuid::new_v4()));
 let mut file=fs::File::create(&tmp).map_err(|e|e.to_string())?;
 file.write_all(&serde_json::to_vec(record).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
 file.sync_all().map_err(|e|e.to_string())?;fs::rename(tmp,path).map_err(|e|e.to_string())
}
fn collect(doc:&Value,known:&mut HashSet<String>,dir:&Path,out:&mut Vec<Value>)->Result<(),String>{
 let mut snapshots=vec![&doc["dictation"]];
 if let Some(backups)=doc["dictationBackups"].as_array(){snapshots.extend(backups);}
 for snapshot in snapshots {if let Some(ss)=snapshot["sentences"].as_array(){for s in ss{
  if s["submitted"]!=true {continue;}
  let mut r=json!({"id":"","projectId":doc["id"],"projectName":doc["name"],"sentenceId":s["id"],"start":s["start"],"end":s["end"],"expected":s["text"],"answer":s["answer"],"attempt":s["attempts"],"submittedAt":null,"recovered":true,"assisted":null});
  let key=fingerprint(&r);if !known.insert(key.clone()){continue;}
  r["id"]=json!(format!("legacy-{key}"));store(dir,&r)?;out.push(r);
 }}}
 Ok(())
}
#[tauri::command]
pub fn submission_record(app:tauri::AppHandle,record:Value)->Result<(),String>{
 for k in ["id","projectId","projectName","sentenceId","expected","answer","submittedAt"]{if !record[k].is_string(){return Err(format!("提交记录字段缺失：{k}"));}}
 if record["expected"].as_str().unwrap().trim().is_empty(){return Err("参考文本不能为空".into());}
 let dir=app.path().app_data_dir().map_err(|e|e.to_string())?.join("submissions");fs::create_dir_all(&dir).map_err(|e|e.to_string())?;store(&dir,&record)
}
#[tauri::command]
pub async fn submission_list(app:tauri::AppHandle,project:Option<Value>)->Result<Value,String>{
 tauri::async_runtime::spawn_blocking(move||list(app,project)).await.map_err(|e|e.to_string())?
}
fn list(app:tauri::AppHandle,project:Option<Value>)->Result<Value,String>{
 let root=app.path().app_data_dir().map_err(|e|e.to_string())?;let dir=root.join("submissions");fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
 let mut records=Vec::new();let mut warnings=Vec::new();
 for e in fs::read_dir(&dir).map_err(|e|e.to_string())?{let p=e.map_err(|e|e.to_string())?.path();if p.extension().and_then(|s|s.to_str())==Some("json"){match read(&p){Ok(r)=>records.push(r),Err(_)=>warnings.push("有一份提交记录损坏，未计入分析".to_string())}}}
 let mut known:HashSet<String>=records.iter().map(fingerprint).collect();
 let library=root.join("library");
 if let Ok(entries)=fs::read_dir(library){for e in entries.flatten(){let p=e.path();if p.file_name().and_then(|n|n.to_str()).is_some_and(|n|n.starts_with("._")){continue;}if p.extension().and_then(|s|s.to_str())!=Some("abmac"){continue;}
  match read(&p){Ok(mut doc)=>{
   if let Err(e)=collect(&doc,&mut known,&dir,&mut records){warnings.push(e);}
   let progress=p.with_extension("progress.json");if progress.exists(){match read(&progress){Ok(saved)=>{for k in ["dictation","dictationBackups"]{if !saved[k].is_null(){doc[k]=saved[k].clone();}}if let Err(e)=collect(&doc,&mut known,&dir,&mut records){warnings.push(e);}},Err(_)=>warnings.push("有一份旧进度无法读取".into())}}
  },Err(_)=>warnings.push("有一份旧材料无法读取".into())}
 }}else{warnings.push("材料库不可用，连接 SSD 后可继续收集旧进度".into());}
 if let Some(doc)=project {collect(&doc,&mut known,&dir,&mut records)?;}
 records.sort_by_key(|r|r["submittedAt"].as_str().unwrap_or("").to_string());
 Ok(json!({"records":records,"warnings":warnings}))
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn migration_keeps_only_available_snapshots_and_is_idempotent(){let dir=std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());fs::create_dir(&dir).unwrap();let doc=json!({"id":"p","name":"x","dictation":{"sentences":[{"id":"s","text":"the cat","answer":"cat","start":0,"end":2,"attempts":4,"submitted":true},{"id":"draft","submitted":false}]}});let mut known=HashSet::new();let mut out=Vec::new();collect(&doc,&mut known,&dir,&mut out).unwrap();collect(&doc,&mut known,&dir,&mut out).unwrap();assert_eq!(out.len(),1);assert!(out[0]["submittedAt"].is_null());assert_eq!(out[0]["attempt"],4);fs::remove_dir_all(dir).unwrap();}
 #[test]fn immutable_record_rejects_overwrite(){let dir=std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());fs::create_dir(&dir).unwrap();let a=json!({"id":"one","answer":"cat"});store(&dir,&a).unwrap();store(&dir,&a).unwrap();assert!(store(&dir,&json!({"id":"one","answer":"dog"})).is_err());assert_eq!(read(&dir.join("one.json")).unwrap(),a);fs::remove_dir_all(dir).unwrap();}
}
