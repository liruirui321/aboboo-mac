#[path="../commands/segmentation.rs"]mod segmentation;
fn main(){let args:Vec<_>=std::env::args().collect();if args.len()!=4{eprintln!("prepare-material WORDS_JSON LLM_RESOURCES OUTPUT_JSON");std::process::exit(2);}
 let doc:serde_json::Value=serde_json::from_slice(&std::fs::read(&args[1]).unwrap()).unwrap();let words=serde_json::from_value(doc["words"].clone()).unwrap();let work=std::env::temp_dir().join(format!("aboboo-prepare-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(&work).unwrap();
 let result=segmentation::segment_words(words,std::path::Path::new(&args[2]),&work,&std::sync::atomic::AtomicBool::new(false),|m|eprintln!("{m}"));
 let _=std::fs::remove_dir_all(work);let result=result.unwrap();std::fs::write(&args[3],serde_json::to_vec_pretty(&result).unwrap()).unwrap();println!("{} sentences; {}",result.segments.len(),result.source);
}
