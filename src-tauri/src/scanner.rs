use walkdir::WalkDir;
use std::path::Path;
use std::fs;
use chrono::{DateTime, Local};
use crate::db;
use crate::extractor;

pub fn scan_folder(folder_path: &Path, db: &rusqlite::Connection) {
    println!("DEBUG: Starting physical scan of folder: {:?}", folder_path);
    for entry in WalkDir::new(folder_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            println!("DEBUG: Found file: {:?}", path);
            let metadata = fs::metadata(path).expect("Failed to get metadata");
            let modified: DateTime<Local> = metadata.modified().expect("Failed to get modified time").into();
            let file_type = path.extension().and_then(|os| os.to_str()).unwrap_or("unknown");
            
            // Extract text content
            let _content = extractor::extract_text_full(path);
            
            let path_str = path.to_str().unwrap();
            let filename = path.file_name().and_then(|os| os.to_str()).unwrap();
            
            println!("DEBUG: Inserting file into DB: {}", filename);
            db::insert_file(
                db,
                path_str,
                filename,
                metadata.len(),
                &modified.to_rfc3339(),
                file_type,
            ).expect("Failed to insert file");
        }
    }
    println!("DEBUG: Finished physical scan");
}
