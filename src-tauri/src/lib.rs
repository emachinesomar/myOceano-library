pub mod db;
pub mod scanner;
pub mod extractor;
pub mod index;
pub mod parser;

use tantivy::schema::Value;
use std::sync::Mutex;
use index::Indexer;

pub struct AppState {
    pub indexer: Mutex<Option<Indexer>>,
}

#[tauri::command]
async fn scan_folder(folder_path: String, _state: tauri::State<'_, AppState>) -> Result<String, String> {
    use crate::scanner;
    use crate::db;
    use rusqlite::Connection;
    use std::fs;
    
    const CURRENT_SCHEMA_VERSION: &str = "3"; // v3: hierarchical metadata (religion, book, chapter, verse)
    
    println!("DEBUG: Starting scan_folder for path: {:?}", folder_path);
    
    let path = std::path::Path::new(&folder_path);
    if !path.exists() {
        println!("DEBUG: Folder does not exist: {:?}", path);
        return Err("Folder does not exist".to_string());
    }
    
    // Get db path in a dedicated application data directory
    let app_data_dir = dirs::data_dir().unwrap_or_else(|| std::path::PathBuf::from(".")).join("ocean_library");
    println!("DEBUG: Using app_data_dir: {:?}", app_data_dir);
    fs::create_dir_all(&app_data_dir).map_err(|e| {
        println!("DEBUG: Failed to create app_data_dir: {:?}", e);
        e.to_string()
    })?;

    let db_path = app_data_dir.join("ocean_library.db");
    let index_path = app_data_dir.join("tantivy_index");
    
    println!("DEBUG: Using db_path: {:?}", db_path);
    let conn = Connection::open(&db_path).map_err(|e| {
        println!("DEBUG: Failed to open db: {:?}", e);
        e.to_string()
    })?;
    db::init_db(&db_path).map_err(|e| {
        println!("DEBUG: Failed to init db: {:?}", e);
        e.to_string()
    })?;
    
    // === MIGRATION CHECK ===
    let stored_version = db::get_metadata(&conn, "schema_version")
        .unwrap_or(None);
    
    let needs_migration = stored_version.as_deref() != Some(CURRENT_SCHEMA_VERSION);
    
    if needs_migration {
        println!("DEBUG: Schema version mismatch. Stored: {:?}, Current: {}", stored_version, CURRENT_SCHEMA_VERSION);
        if stored_version.as_deref() == Some("2") {
            println!("DEBUG: Reindexing due to schema bump v2 → v3: adding metadata fields (religion, book, chapter, verse)");
        }
        println!("DEBUG: Clearing old index and indexed_files for migration...");
        
        // Borrar índice viejo
        if index_path.exists() {
            fs::remove_dir_all(&index_path).map_err(|e| {
                println!("DEBUG: Failed to remove old index: {:?}", e);
                e.to_string()
            })?;
        }
        
        // Limpiar registro de archivos indexados
        db::clear_indexed_files(&conn).map_err(|e| {
            println!("DEBUG: Failed to clear indexed_files: {:?}", e);
            e.to_string()
        })?;
        
        // Guardar nueva versión
        db::set_metadata(&conn, "schema_version", CURRENT_SCHEMA_VERSION).map_err(|e| {
            println!("DEBUG: Failed to set schema_version: {:?}", e);
            e.to_string()
        })?;
        
        println!("DEBUG: Migration completed. Will reindex all files.");
    }
    
    // Scan and insert into DB
    println!("DEBUG: Calling scanner::scan_folder");
    scanner::scan_folder(path, &conn);
    println!("DEBUG: scan_folder completed");
    
    // === INCREMENTAL INDEXING ===
    println!("DEBUG: Starting incremental indexing");
    let mut indexer = Indexer::new(&index_path).map_err(|e| {
        println!("DEBUG: Failed to create indexer: {:?}", e);
        e.to_string()
    })?;
    
    let mut indexed_count = 0;
    let mut skipped_count = 0;
    
    for entry in walkdir::WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        if p.is_file() {
            let ext = p.extension().and_then(|os| os.to_str()).unwrap_or("");
            if ext == "txt" || ext == "pdf" || ext == "docx" {
                let path_str = p.to_str().unwrap_or("");
                
                // Get file modification time
                let mtime = fs::metadata(p)
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                
                // Check if file was already indexed and hasn't changed
                let stored_mtime = db::get_indexed_file_mtime(&conn, path_str)
                    .unwrap_or(None);
                
                if stored_mtime == Some(mtime) && !needs_migration {
                    println!("DEBUG: Skipping already-indexed file: {:?}", p);
                    skipped_count += 1;
                    continue;
                }
                
                // Index the file
                println!("DEBUG: Indexing file: {:?}", p);
                let content = crate::extractor::extract_text_full(p);

                // Stage 3: parse hierarchical metadata and persist it.
                let meta = crate::parser::parse_metadata(p);
                let file_id = db::get_file_id_by_path(&conn, path_str)
                    .map_err(|e| {
                        println!("DEBUG: Failed to look up file_id for {:?}: {:?}", p, e);
                        e.to_string()
                    })?;
                if let Some(fid) = file_id {
                    let record = db::DocumentMetadataRecord {
                        file_id: fid,
                        religion: meta.religion.clone(),
                        book: meta.book.clone(),
                        chapter: meta.chapter.clone(),
                        verse: meta.verse.clone(),
                    };
                    db::upsert_document_metadata(&conn, &record).map_err(|e| {
                        println!("DEBUG: Failed to upsert document_metadata for {:?}: {:?}", p, e);
                        e.to_string()
                    })?;
                } else {
                    println!("DEBUG: No file_id for path {} (scanner may not have inserted it yet)", path_str);
                }

                indexer
                    .index_document(
                        path_str,
                        &content,
                        "",
                        &meta.religion,
                        &meta.book,
                        meta.chapter.as_deref(),
                        meta.verse.as_deref(),
                    )
                    .map_err(|e| {
                        println!("DEBUG: Failed to index document {:?}: {:?}", p, e);
                        e.to_string()
                    })?;

                // Record in indexed_files
                db::insert_indexed_file(&conn, path_str, mtime).map_err(|e| {
                    println!("DEBUG: Failed to record indexed file: {:?}", e);
                    e.to_string()
                })?;
                
                indexed_count += 1;
            }
        }
    }
    
    println!("DEBUG: Indexing completed. Indexed: {}, Skipped: {}", indexed_count, skipped_count);
    
    Ok(format!("Scanned folder: {}. Indexed: {}, Skipped: {} (cached)", folder_path, indexed_count, skipped_count))
}

#[tauri::command]
async fn list_files(_folder_path: String) -> Result<String, String> {
    use rusqlite::Connection;
    
    let app_data_dir = dirs::data_dir().unwrap_or_else(|| std::path::PathBuf::from(".")).join("ocean_library");
    let db_path = app_data_dir.join("ocean_library.db");
    
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT path, filename, file_type FROM files")
        .map_err(|e| e.to_string())?;
    
    let files = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "path": row.get::<_, String>(0)?,
            "name": row.get::<_, String>(1)?,
            "type": row.get::<_, String>(2)?
        }))
    }).map_err(|e| e.to_string())?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| e.to_string())?;
    
    Ok(serde_json::to_string(&files).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn full_text_search(
    query: String,
    _folder_path: String,
    offset: Option<usize>,
) -> Result<String, String> {
    use tantivy::collector::TopDocs;
    use tantivy::query::QueryParser;
    use tantivy::SnippetGenerator;

    const PAGE_SIZE: usize = 20;

    let app_data_dir = dirs::data_dir().unwrap_or_else(|| std::path::PathBuf::from(".")).join("ocean_library");
    let index_path = app_data_dir.join("tantivy_index");

    if !index_path.exists() {
        return Ok(r#"{"results":[],"hasMore":false,"offset":0}"#.to_string());
    }

    let index = tantivy::Index::open_in_dir(&index_path).map_err(|e| e.to_string())?;
    let reader = index.reader().map_err(|e| e.to_string())?;
    let searcher = reader.searcher();

    let schema = index.schema();
    let text_field = schema.get_field("text").map_err(|_| "Field not found")?;
    let path_field = schema.get_field("path").map_err(|_| "Field not found")?;
    let religion_field = schema.get_field("religion").ok();
    let book_field = schema.get_field("book").ok();
    let chapter_field = schema.get_field("chapter").ok();
    let verse_field = schema.get_field("verse").ok();

    let query_parser = QueryParser::for_index(&index, vec![text_field]);
    let parsed_query = query_parser.parse_query(&query).map_err(|e| e.to_string())?;

    let offset = offset.unwrap_or(0);
    let top_docs = searcher
        .search(&parsed_query, &TopDocs::with_limit(PAGE_SIZE).and_offset(offset))
        .map_err(|e| e.to_string())?;

    // Configurar el generador de snippets con máximo tamaño posible
    let mut snippet_generator = SnippetGenerator::create(&searcher, &parsed_query, text_field)
        .map_err(|e| e.to_string())?;
    snippet_generator.set_max_num_chars(2000); // Extraer hasta 2000 caracteres (máximo posible)

    let mut results = Vec::new();
    for (_score, doc_address) in top_docs {
        let retrieved_doc: tantivy::TantivyDocument = searcher.doc(doc_address).map_err(|e| e.to_string())?;

        let path = retrieved_doc.get_first(path_field)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let religion = religion_field
            .and_then(|f| retrieved_doc.get_first(f))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let book = book_field
            .and_then(|f| retrieved_doc.get_first(f))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let chapter = chapter_field
            .and_then(|f| retrieved_doc.get_first(f))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let verse = verse_field
            .and_then(|f| retrieved_doc.get_first(f))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // Generar snippet real con la palabra buscada resaltada
        let snippet = snippet_generator.snippet_from_doc(&retrieved_doc);
        let snippet_html = snippet.to_html(); // Esto devuelve la palabra rodeada de <mark>

        results.push(serde_json::json!({
            "path": path,
            "religion": religion,
            "book": book,
            "chapter": chapter,
            "verse": verse,
            "snippet": snippet_html,
            "score": _score
        }));
    }

    // Heuristic: if we filled the page, more results might exist
    let has_more = results.len() == PAGE_SIZE;

    let payload = serde_json::json!({
        "results": results,
        "hasMore": has_more,
        "offset": offset,
    });

    Ok(serde_json::to_string(&payload).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn search(query: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let res = client.post("http://localhost:8000/embed_chunks")
        .json(&serde_json::json!({"chunks": [query]}))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json.to_string())
}

/// Run a full-text search scoped to documents tagged with a specific
/// religion. Combines the parsed user query on the `text` field with a
/// `TermQuery` on `religion`, so both must match.
#[tauri::command]
async fn search_by_religion(
    query: String,
    religion: String,
    _folder_path: String,
    offset: Option<usize>,
) -> Result<String, String> {
    run_faceted_search(query, "religion", &religion, offset).await
}

/// Run a full-text search scoped to documents tagged with a specific
/// book. Combines the parsed user query on the `text` field with a
/// `TermQuery` on `book`.
#[tauri::command]
async fn search_by_book(
    query: String,
    book: String,
    _folder_path: String,
    offset: Option<usize>,
) -> Result<String, String> {
    run_faceted_search(query, "book", &book, offset).await
}

/// Shared implementation for `search_by_religion` and `search_by_book`.
/// Opens the on-disk Tantivy index, builds a `BooleanQuery` that ANDs the
/// user query (text field) with a `TermQuery` on the requested facet
/// field, and returns the same JSON shape as `full_text_search` so the
/// UI can treat all three commands interchangeably.
async fn run_faceted_search(
    query: String,
    facet_field: &str,
    facet_value: &str,
    offset: Option<usize>,
) -> Result<String, String> {
    use tantivy::collector::TopDocs;
    use tantivy::query::QueryParser;
    use tantivy::SnippetGenerator;

    const PAGE_SIZE: usize = 20;

    let app_data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("ocean_library");
    let index_path = app_data_dir.join("tantivy_index");

    if !index_path.exists() {
        return Ok(r#"{"results":[],"hasMore":false,"offset":0}"#.to_string());
    }

    let indexer = Indexer::new(&index_path).map_err(|e| e.to_string())?;
    let index = indexer.raw_index();
    let reader = index.reader().map_err(|e| e.to_string())?;
    let searcher = reader.searcher();

    let schema = index.schema();
    let text_field = schema.get_field("text").map_err(|_| "Field not found")?;
    let path_field = schema.get_field("path").map_err(|_| "Field not found")?;
    let religion_field = schema.get_field("religion").ok();
    let book_field = schema.get_field("book").ok();
    let chapter_field = schema.get_field("chapter").ok();
    let verse_field = schema.get_field("verse").ok();

    let combined_query = indexer
        .build_facet_query(&query, facet_field, facet_value)
        .map_err(|e| e.to_string())?;

    let offset = offset.unwrap_or(0);
    let top_docs = searcher
        .search(
            combined_query.as_ref(),
            &TopDocs::with_limit(PAGE_SIZE).and_offset(offset),
        )
        .map_err(|e| e.to_string())?;

    // Re-parse the user query alone to drive the snippet generator.
    // SnippetGenerator only cares about terms on the text field, so the
    // simpler user query produces the same `<mark>` output as the full
    // BooleanQuery would.
    let query_parser = QueryParser::for_index(index, vec![text_field]);
    let parsed_for_snippet = query_parser.parse_query(&query).map_err(|e| e.to_string())?;
    let mut snippet_generator =
        SnippetGenerator::create(&searcher, &parsed_for_snippet, text_field)
            .map_err(|e| e.to_string())?;
    snippet_generator.set_max_num_chars(2000);

    let mut results = Vec::new();
    for (_score, doc_address) in top_docs {
        let retrieved_doc: tantivy::TantivyDocument =
            searcher.doc(doc_address).map_err(|e| e.to_string())?;

        let path = retrieved_doc
            .get_first(path_field)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let religion = religion_field
            .and_then(|f| retrieved_doc.get_first(f))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let book = book_field
            .and_then(|f| retrieved_doc.get_first(f))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let chapter = chapter_field
            .and_then(|f| retrieved_doc.get_first(f))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let verse = verse_field
            .and_then(|f| retrieved_doc.get_first(f))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let snippet = snippet_generator.snippet_from_doc(&retrieved_doc);
        let snippet_html = snippet.to_html();

        results.push(serde_json::json!({
            "path": path,
            "religion": religion,
            "book": book,
            "chapter": chapter,
            "verse": verse,
            "snippet": snippet_html,
            "score": _score
        }));
    }

    let has_more = results.len() == PAGE_SIZE;
    let payload = serde_json::json!({
        "results": results,
        "hasMore": has_more,
        "offset": offset,
    });

    Ok(serde_json::to_string(&payload).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn clear_index() -> Result<String, String> {
    let app_data_dir = dirs::data_dir().unwrap_or_else(|| std::path::PathBuf::from(".")).join("ocean_library");
    let index_path = app_data_dir.join("tantivy_index");
    let db_path = app_data_dir.join("ocean_library.db");
    
    // Delete index
    if index_path.exists() {
        std::fs::remove_dir_all(&index_path).map_err(|e| e.to_string())?;
    }
    
    // Reset indexed_files in DB
    if db_path.exists() {
        let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM indexed_files", []).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM document_metadata", []).map_err(|e| e.to_string())?;
        // Reset schema version to force reindex on next scan
        conn.execute("DELETE FROM metadata WHERE key = 'schema_version'", []).map_err(|e| e.to_string())?;
    }
    
    Ok("Index cleared. Re-scan a folder to rebuild.".to_string())
}

#[tauri::command]
async fn read_document(
    path: String,
    query: Option<String>,
) -> Result<ReadDocumentResult, String> {
    use std::fs;

    let p = std::path::Path::new(&path);
    let ext = p.extension().and_then(|os| os.to_str()).unwrap_or("");

    let content = match ext {
        "txt" => fs::read_to_string(&path).map_err(|e| e.to_string())?,
        "pdf" => crate::extractor::extract_text_full(p),
        "docx" => {
            // DOCX support is out of scope for Stage 2; preserve the original placeholder.
            return Ok(ReadDocumentResult {
                content: format!(
                    "DOCX file: {}\n\nDOCX content extraction would go here.",
                    path
                ),
                match_offset: None,
            });
        }
        _ => return Err("Unsupported file type".to_string()),
    };

    let match_offset = query
        .as_deref()
        .and_then(|q| find_first_match_offset(&content, q));

    Ok(ReadDocumentResult {
        content,
        match_offset,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadDocumentResult {
    content: String,
    /// Byte offset of the first match of any query term in `content`, if any.
    match_offset: Option<usize>,
}

/// Extract the search terms from a raw query string.
///
/// Splits on whitespace, strips surrounding quotes, and removes Tantivy
/// boolean-operator syntax (`+`, `-`, `*`, `~N`) and the literal operators
/// `AND` / `OR` / `NOT`. Returns the cleaned terms as owned `String`s so
/// we can downcase them for case-insensitive matching.
fn extract_query_terms(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .filter_map(|raw| {
            // Strip surrounding quotes (single or double).
            let t = raw.trim_matches(|c: char| c == '"' || c == '\'');
            // Strip leading +/- (Tantivy required / prohibited markers).
            let t = t.trim_start_matches(['+', '-']);
            // Strip trailing wildcard and fuzzy suffix: `paz*` → `paz`, `paz~2` → `paz`.
            let t = t.trim_end_matches('*');
            let t = t.split('~').next().unwrap_or(t);
            if t.is_empty() {
                return None;
            }
            // Skip boolean operator keywords.
            if matches!(t.to_ascii_uppercase().as_str(), "AND" | "OR" | "NOT") {
                return None;
            }
            Some(t.to_lowercase())
        })
        .collect()
}

/// Find the byte offset of the first occurrence of any query term in
/// `content`, case-insensitive. Returns `None` when no term matches or
/// the query has no usable terms.
fn find_first_match_offset(content: &str, query: &str) -> Option<usize> {
    let terms = extract_query_terms(query);
    if terms.is_empty() {
        return None;
    }

    let content_lower = content.to_lowercase();
    let mut best: Option<usize> = None;
    for term in &terms {
        if let Some(pos) = content_lower.find(term.as_str()) {
            best = Some(match best {
                None => pos,
                Some(current) => current.min(pos),
            });
        }
    }
    best
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            indexer: Mutex::new(None),
        })
        .setup(|_app| {
            // Spawn Python sidecar in background for dev mode
            std::thread::spawn(|| {
                let sidecar_path = std::path::PathBuf::from("sidecar/main.py");
                if sidecar_path.exists() {
                    let _child = std::process::Command::new("python")
                        .arg(&sidecar_path)
                        .spawn();
                }
            });
            
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            full_text_search,
            list_files,
            search,
            read_document,
            search_by_religion,
            search_by_book,
            clear_index
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}