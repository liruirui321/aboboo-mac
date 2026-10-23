use serde_json::{json, Value};
use std::{fs, path::PathBuf};
use tauri::Manager;
fn directory(app: &tauri::AppHandle) -> Result<PathBuf,String> {
    let dir=app.path().app_data_dir().map_err(|e|e.to_string())?.join("library");
    fs::create_dir_all(&dir).map_err(|e|e.to_string())?; Ok(dir)
}
fn valid(id:&str)->Result<(),String>{uuid::Uuid::parse_str(id).map(|_|()).map_err(|_|"材料编号无效".into())}
fn write_atomic(path:&std::path::Path,value:&Value)->Result<(),String>{
    let tmp=path.with_extension(format!("{}.tmp",uuid::Uuid::new_v4()));
    fs::write(&tmp,serde_json::to_vec(value).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    fs::rename(&tmp,path).map_err(|e|e.to_string())
}
fn read(path:&std::path::Path)->Result<Value,String>{serde_json::from_slice(&fs::read(path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())}
#[tauri::command]
pub fn library_list(app:tauri::AppHandle)->Result<Vec<Value>,String>{
    let dir=directory(&app)?;let mut out=Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e|e.to_string())? {
        let path=entry.map_err(|e|e.to_string())?.path();
        if path.file_name().and_then(|n|n.to_str()).is_some_and(|n|n.starts_with("._")) || !path.to_string_lossy().ends_with(".meta.json"){continue;}
        let mut meta=read(&path)?;let id=meta["id"].as_str().ok_or("材料索引无效")?;valid(id)?;
        if !dir.join(format!("{id}.abmac")).is_file(){continue;}
        let progress=dir.join(format!("{id}.progress.json"));
        if progress.is_file(){let p=read(&progress)?;if let Some(ss)=p["dictation"]["sentences"].as_array(){meta["sentenceCount"]=json!(ss.len());meta["completed"]=json!(ss.iter().filter(|s|s["submitted"].as_bool()==Some(true)).count());}meta["favorites"]=json!(p["favorites"].as_array().map_or(0,|v|v.len()));}
        out.push(meta);
    }
    out.sort_by_key(|v|v["name"].as_str().unwrap_or("").to_string());Ok(out)
}
#[tauri::command]
pub fn library_open(app:tauri::AppHandle,id:String)->Result<String,String>{
    valid(&id)?;let dir=directory(&app)?;let mut doc=read(&dir.join(format!("{id}.abmac")))?;
    let progress=dir.join(format!("{id}.progress.json"));
    if progress.is_file(){let p=read(&progress)?;for key in ["dictation","favorites","dictationBackups"]{if !p[key].is_null(){doc[key]=p[key].clone();}}}
    doc["libraryId"]=json!(id);serde_json::to_string(&doc).map_err(|e|e.to_string())
}
#[tauri::command]
pub fn library_add(app:tauri::AppHandle,document:String)->Result<String,String>{
    let doc:Value=serde_json::from_str(&document).map_err(|e|e.to_string())?;
    let id=doc["id"].as_str().ok_or("项目编号缺失")?;valid(id)?;
    if doc["format"]!="aboboo-community-v1"||!doc["embeddedAudio"].is_object(){return Err("项目音频缺失".into());}
    let dir=directory(&app)?;
    write_atomic(&dir.join(format!("{id}.abmac")),&doc)?;
    let ss=doc["dictation"]["sentences"].as_array();
    write_atomic(&dir.join(format!("{id}.meta.json")),&json!({"id":id,"name":doc["name"],"duration":doc["duration"],"sentenceCount":ss.map_or(0,|s|s.len()),"completed":ss.map_or(0,|s|s.iter().filter(|s|s["submitted"]==true).count()),"favorites":doc["favorites"].as_array().map_or(0,|s|s.len())}))?;
    library_save_progress(app,id.to_string(),json!({"dictation":doc["dictation"],"favorites":doc["favorites"],"dictationBackups":doc["dictationBackups"]}))?;Ok(id.to_string())
}
#[tauri::command]
pub fn library_save_progress(app:tauri::AppHandle,id:String,progress:Value)->Result<(),String>{
    valid(&id)?;let dir=directory(&app)?;
    if !dir.join(format!("{id}.abmac")).is_file(){return Err("材料不存在，请重新加入材料库".into());}
    write_atomic(&dir.join(format!("{id}.progress.json")),&progress)
}
