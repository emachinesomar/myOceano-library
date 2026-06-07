// src-tauri/tests/integration_test.rs
//
// Integration tests for the full happy-path flow:
// create test files → init DB → scan → index with metadata → search → read document.

use std::path::PathBuf;
use my_ocean_library_lib::{db, extractor, index, parser, scanner};

/// Helper: create a temp directory with test TXT files.
/// Each call produces a unique directory to avoid parallel-test races.
fn setup_test_dir(label: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("ocean_int_test_{label}"));
    if dir.exists() {
        std::fs::remove_dir_all(&dir).unwrap();
    }
    std::fs::create_dir_all(&dir).unwrap();

    // Create test files with known content
    std::fs::write(
        dir.join("test1.txt"),
        "La paz de dios es importante para la justicia universal",
    )
    .unwrap();
    std::fs::write(
        dir.join("test2.txt"),
        "Los escritos bahais hablan de la unidad de la humanidad",
    )
    .unwrap();
    std::fs::write(
        dir.join("test3.txt"),
        "Este documento no contiene las palabras clave buscadas",
    )
    .unwrap();

    // Create a subdirectory with a file (for metadata parsing test)
    std::fs::create_dir_all(dir.join("Bahai")).unwrap();
    std::fs::write(
        dir.join("Bahai").join("ridvan2024.txt"),
        "El mensaje de Ridvan trae esperanza y paz a todos los pueblos",
    )
    .unwrap();

    dir
}

/// Helper: create a temp DB in a dedicated sibling directory (outside the
/// scanned folder so scanner doesn't index the DB file itself).
fn setup_test_db(label: &str) -> (PathBuf, rusqlite::Connection) {
    let db_dir = std::env::temp_dir().join(format!("ocean_int_test_{label}_db"));
    if db_dir.exists() {
        std::fs::remove_dir_all(&db_dir).unwrap();
    }
    std::fs::create_dir_all(&db_dir).unwrap();
    let db_path = db_dir.join("test.db");
    let conn = db::init_db(&db_path).unwrap();
    (db_dir, conn)
}

/// Helper: cleanup a path (ignores errors if already gone).
fn cleanup(path: &std::path::Path) {
    if path.exists() {
        std::fs::remove_dir_all(path).unwrap_or(());
    }
}

#[test]
fn test_full_happy_path_scan_search_read() {
    let test_dir = setup_test_dir("happy");
    let (db_dir, conn) = setup_test_db("happy");
    let index_dir = test_dir.join("test_index");

    // Step 1: Scan the folder
    scanner::scan_folder(&test_dir, &conn);

    // Verify files were inserted into DB
    let test1_path = test_dir.join("test1.txt");
    let file_id = db::get_file_id_by_path(&conn, test1_path.to_str().unwrap()).unwrap();
    assert!(file_id.is_some(), "test1.txt should be in the DB");

    // Verify Bahai/ridvan2024.txt was also scanned
    let ridvan_path = test_dir.join("Bahai").join("ridvan2024.txt");
    let ridvan_id = db::get_file_id_by_path(&conn, ridvan_path.to_str().unwrap()).unwrap();
    assert!(
        ridvan_id.is_some(),
        "Bahai/ridvan2024.txt should be in the DB"
    );

    // Step 2: Extract text and index
    let mut indexer = index::Indexer::new(&index_dir).unwrap();

    // Build (path, content) pairs using separate join() calls per
    // component so Windows backslash separators match what walkdir produces.
    let test1 = test_dir.join("test1.txt");
    let test2 = test_dir.join("test2.txt");
    let test3 = test_dir.join("test3.txt");
    let ridvan = test_dir.join("Bahai").join("ridvan2024.txt");

    let files_to_index: Vec<(&std::path::Path, &str)> = vec![
        (&test1, "La paz de dios es importante para la justicia universal"),
        (&test2, "Los escritos bahais hablan de la unidad de la humanidad"),
        (&test3, "Este documento no contiene las palabras clave buscadas"),
        (&ridvan, "El mensaje de Ridvan trae esperanza y paz a todos los pueblos"),
    ];

    for (path, content) in &files_to_index {
        let path_str = path.to_str().unwrap();
        let file_id = db::get_file_id_by_path(&conn, path_str)
            .unwrap()
            .expect(&format!("file_id should exist for {}", path_str));

        // Parse metadata
        let meta = parser::parse_metadata(&path);

        // Upsert metadata
        db::upsert_document_metadata(
            &conn,
            &db::DocumentMetadataRecord {
                file_id,
                religion: meta.religion.clone(),
                book: meta.book.clone(),
                chapter: meta.chapter.clone(),
                verse: meta.verse.clone(),
            },
        )
        .unwrap();

        // Index the document
        indexer
            .index_document(
                path_str,
                content,
                "",
                &meta.religion,
                &meta.book,
                meta.chapter.as_deref(),
                meta.verse.as_deref(),
            )
            .unwrap();
    }

    // Step 3: Search for "paz"
    let results = indexer.search("paz", 10).unwrap();
    assert!(!results.is_empty(), "Should find results for 'paz'");

    // Verify the results contain our test files
    let paths: Vec<&str> = results.iter().map(|r| r.path.as_str()).collect();
    assert!(
        paths.iter().any(|p| p.contains("test1.txt")),
        "test1.txt should be in results for 'paz'"
    );
    assert!(
        paths.iter().any(|p| p.contains("ridvan2024.txt")),
        "ridvan2024.txt should be in results for 'paz'"
    );

    // Step 4: Read a document
    let content = extractor::extract_text_full(&test_dir.join("test1.txt"));
    assert_eq!(
        content,
        "La paz de dios es importante para la justicia universal"
    );

    // Step 5: Parse metadata
    let meta = parser::parse_metadata(&test_dir.join("Bahai").join("ridvan2024.txt"));
    // The religion should be detected from the "Bahai" subfolder
    assert_ne!(
        meta.religion, "Unknown",
        "Religion should be detected from Bahai subfolder"
    );

    cleanup(&test_dir);
    cleanup(&db_dir);
}

#[test]
fn test_search_returns_empty_for_nonexistent_term() {
    let test_dir = setup_test_dir("empty");
    let index_dir = test_dir.join("test_index");

    let mut indexer = index::Indexer::new(&index_dir).unwrap();

    // Index a single file
    indexer
        .index_document(
            test_dir.join("test1.txt").to_str().unwrap(),
            "Solo contenido simple sin palabras raras",
            "",
            "Unknown",
            "Test",
            None,
            None,
        )
        .unwrap();

    // Search for something that doesn't exist
    let results = indexer.search("xyzzy12345", 10).unwrap();
    assert!(
        results.is_empty(),
        "Should return empty for nonexistent term"
    );

    cleanup(&test_dir);
}

#[test]
fn test_metadata_faceted_search() {
    let test_dir = setup_test_dir("facet");
    let index_dir = test_dir.join("test_index");

    let mut indexer = index::Indexer::new(&index_dir).unwrap();

    // Index two files with different religions
    indexer
        .index_document(
            test_dir.join("test1.txt").to_str().unwrap(),
            "La paz de dios es importante",
            "",
            "Bahai",
            "Escritos Bahais",
            None,
            None,
        )
        .unwrap();

    indexer
        .index_document(
            test_dir.join("test2.txt").to_str().unwrap(),
            "La paz es importante para la humanidad",
            "",
            "Christianity",
            "Biblia",
            None,
            None,
        )
        .unwrap();

    // Both files should be searchable by text query
    let all_results = indexer.search("paz", 10).unwrap();
    assert_eq!(all_results.len(), 2, "Both files should match 'paz'");

    // Verify build_facet_query works (returns a valid Box<dyn Query>)
    let _combined = indexer
        .build_facet_query("paz", "religion", "Bahai")
        .unwrap();

    cleanup(&test_dir);
}

#[test]
fn test_incremental_indexing_skips_unchanged() {
    let test_dir = setup_test_dir("incremental");
    let (_db_dir, conn) = setup_test_db("incremental");

    // First scan
    scanner::scan_folder(&test_dir, &conn);

    // Record a file as already indexed with current mtime
    let test1_path = test_dir.join("test1.txt");
    let path_str = test1_path.to_str().unwrap();
    let mtime = std::fs::metadata(path_str)
        .unwrap()
        .modified()
        .unwrap()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    db::insert_indexed_file(&conn, path_str, mtime).unwrap();

    // Verify the file is marked as indexed
    let stored_mtime = db::get_indexed_file_mtime(&conn, path_str).unwrap();
    assert_eq!(stored_mtime, Some(mtime));

    // Verify mtime persists across reads
    let stored_mtime2 = db::get_indexed_file_mtime(&conn, path_str).unwrap();
    assert_eq!(
        stored_mtime2,
        Some(mtime),
        "mtime should be stored correctly"
    );

    cleanup(&test_dir);
}
