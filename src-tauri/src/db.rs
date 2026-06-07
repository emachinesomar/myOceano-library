use rusqlite::{params, Connection, Result, OptionalExtension};
use std::path::Path;

pub fn init_db(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            filename TEXT NOT NULL,
            size INTEGER NOT NULL,
            modified_at TEXT NOT NULL,
            file_type TEXT NOT NULL
        )",
        [],
    )?;

    // Tabla de metadatos para versionado de schema
    conn.execute(
        "CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    // Tabla para trackear archivos indexados (incremental indexing)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS indexed_files (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            mtime INTEGER NOT NULL,
            indexed_at TEXT NOT NULL
        )",
        [],
    )?;

    // Stage 3: tabla de metadatos jerárquicos por documento
    // (religión → libro → capítulo → versículo). Una fila por archivo
    // indexado, referenciada por file_id. Se borra en cascada si el
    // archivo desaparece.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS document_metadata (
            id INTEGER PRIMARY KEY,
            file_id INTEGER NOT NULL UNIQUE,
            religion TEXT NOT NULL,
            book TEXT NOT NULL,
            chapter TEXT,
            verse TEXT,
            extracted_at TEXT NOT NULL,
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
        )",
        [],
    )?;

    Ok(conn)
}

pub fn insert_file(conn: &Connection, path: &str, filename: &str, size: u64, modified_at: &str, file_type: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO files (path, filename, size, modified_at, file_type) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![path, filename, size, modified_at, file_type],
    )?;
    Ok(())
}

// Metadatos: guardar/leer versión de schema
pub fn set_metadata(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_metadata(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM metadata WHERE key = ?1")?;
    let result = stmt.query_row(params![key], |row| row.get(0)).optional()?;
    Ok(result)
}

// Indexed files: trackear qué archivos ya fueron indexados
pub fn insert_indexed_file(conn: &Connection, path: &str, mtime: i64) -> Result<()> {
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "INSERT OR REPLACE INTO indexed_files (path, mtime, indexed_at) VALUES (?1, ?2, ?3)",
        params![path, mtime, now],
    )?;
    Ok(())
}

pub fn get_indexed_file_mtime(conn: &Connection, path: &str) -> Result<Option<i64>> {
    let mut stmt = conn.prepare("SELECT mtime FROM indexed_files WHERE path = ?1")?;
    let result = stmt.query_row(params![path], |row| row.get(0)).optional()?;
    Ok(result)
}

pub fn clear_indexed_files(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM indexed_files", [])?;
    Ok(())
}

// === Files helpers ===

/// Look up a file's primary key by its path. Returns `None` if no row exists.
pub fn get_file_id_by_path(conn: &Connection, path: &str) -> Result<Option<i64>> {
    let mut stmt = conn.prepare("SELECT id FROM files WHERE path = ?1")?;
    let result = stmt.query_row(params![path], |row| row.get(0)).optional()?;
    Ok(result)
}

// === Stage 3: hierarchical document metadata ===

/// Structured metadata for a single indexed document. Stored in
/// `document_metadata` and also indexed in Tantivy as separate fields so
/// search results can be grouped/filtered by religion/book/chapter/verse.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DocumentMetadataRecord {
    pub file_id: i64,
    pub religion: String,
    pub book: String,
    pub chapter: Option<String>,
    pub verse: Option<String>,
}

/// Insert or replace the metadata row for a file. Called by `scan_folder`
/// after the file has been parsed, before the Tantivy document is written.
pub fn upsert_document_metadata(
    conn: &Connection,
    meta: &DocumentMetadataRecord,
) -> Result<()> {
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "INSERT OR REPLACE INTO document_metadata
         (file_id, religion, book, chapter, verse, extracted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            meta.file_id,
            meta.religion,
            meta.book,
            meta.chapter,
            meta.verse,
            now,
        ],
    )?;
    Ok(())
}

/// Fetch the metadata row for a single file. Returns `None` if no row has
/// been extracted yet (e.g. before a scan completed).
pub fn get_document_metadata(
    conn: &Connection,
    file_id: i64,
) -> Result<Option<DocumentMetadataRecord>> {
    let mut stmt = conn.prepare(
        "SELECT file_id, religion, book, chapter, verse
         FROM document_metadata
         WHERE file_id = ?1",
    )?;
    let result = stmt
        .query_row(params![file_id], |row| {
            Ok(DocumentMetadataRecord {
                file_id: row.get(0)?,
                religion: row.get(1)?,
                book: row.get(2)?,
                chapter: row.get(3)?,
                verse: row.get(4)?,
            })
        })
        .optional()?;
    Ok(result)
}

/// List every metadata row currently stored. Used by Stage 4 to build the
/// initial result tree and by debug tools to inspect the corpus.
pub fn list_all_metadata(
    conn: &Connection,
) -> Result<Vec<(i64, DocumentMetadataRecord)>> {
    let mut stmt = conn.prepare(
        "SELECT file_id, religion, book, chapter, verse
         FROM document_metadata",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                DocumentMetadataRecord {
                    file_id: row.get(0)?,
                    religion: row.get(1)?,
                    book: row.get(2)?,
                    chapter: row.get(3)?,
                    verse: row.get(4)?,
                },
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp_db(name: &str) -> Connection {
        let dir = std::env::temp_dir().join(format!("ocean_test_db_{name}"));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("test.db");
        // Remove stale DB if it exists
        let _ = std::fs::remove_file(&db_path);
        init_db(&db_path).unwrap()
    }

    fn cleanup(name: &str) {
        let dir = std::env::temp_dir().join(format!("ocean_test_db_{name}"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_init_db_creates_tables() {
        let conn = temp_db("init");
        // Verify all four tables exist by querying them
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(tables.contains(&"files".to_string()));
        assert!(tables.contains(&"metadata".to_string()));
        assert!(tables.contains(&"indexed_files".to_string()));
        assert!(tables.contains(&"document_metadata".to_string()));
        cleanup("init");
    }

    #[test]
    fn test_init_db_idempotent() {
        let dir = std::env::temp_dir().join("ocean_test_db_idempotent");
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("test.db");
        let _ = std::fs::remove_file(&db_path);
        // Calling init_db twice should not fail
        init_db(&db_path).unwrap();
        init_db(&db_path).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_insert_and_get_file_id() {
        let conn = temp_db("insert_file");
        insert_file(
            &conn,
            "/path/to/test.txt",
            "test.txt",
            1024,
            "2025-01-01T00:00:00",
            "txt",
        )
        .unwrap();
        let id = get_file_id_by_path(&conn, "/path/to/test.txt").unwrap();
        assert!(id.is_some());
        assert_eq!(id.unwrap(), 1);

        // Non-existent path returns None
        let missing = get_file_id_by_path(&conn, "/no/such/file.txt").unwrap();
        assert!(missing.is_none());
        cleanup("insert_file");
    }

    #[test]
    fn test_insert_file_replace() {
        let conn = temp_db("insert_replace");
        insert_file(
            &conn,
            "/path/to/doc.pdf",
            "doc.pdf",
            500,
            "2025-01-01T00:00:00",
            "pdf",
        )
        .unwrap();
        // INSERT OR REPLACE: same path, different size
        insert_file(
            &conn,
            "/path/to/doc.pdf",
            "doc.pdf",
            9999,
            "2025-06-01T00:00:00",
            "pdf",
        )
        .unwrap();
        let id = get_file_id_by_path(&conn, "/path/to/doc.pdf").unwrap();
        assert!(id.is_some());
        cleanup("insert_replace");
    }

    #[test]
    fn test_upsert_and_get_document_metadata() {
        let conn = temp_db("upsert_meta");
        // Insert a file first so the FK is valid
        insert_file(
            &conn,
            "/path/to/doc.txt",
            "doc.txt",
            100,
            "2025-01-01T00:00:00",
            "txt",
        )
        .unwrap();
        let file_id = get_file_id_by_path(&conn, "/path/to/doc.txt").unwrap().unwrap();

        let meta = DocumentMetadataRecord {
            file_id,
            religion: "Bahá'í".to_string(),
            book: "Kitáb-i-Íqán".to_string(),
            chapter: Some("1".to_string()),
            verse: None,
        };
        upsert_document_metadata(&conn, &meta).unwrap();

        let fetched = get_document_metadata(&conn, file_id).unwrap();
        assert!(fetched.is_some());
        let fetched = fetched.unwrap();
        assert_eq!(fetched.religion, "Bahá'í");
        assert_eq!(fetched.book, "Kitáb-i-Íqán");
        assert_eq!(fetched.chapter.as_deref(), Some("1"));
        assert_eq!(fetched.verse, None);

        // Non-existent file_id returns None
        assert!(get_document_metadata(&conn, 9999).unwrap().is_none());
        cleanup("upsert_meta");
    }

    #[test]
    fn test_metadata_get_set() {
        let conn = temp_db("metadata_ops");
        set_metadata(&conn, "schema_version", "3").unwrap();
        let val = get_metadata(&conn, "schema_version").unwrap();
        assert_eq!(val.as_deref(), Some("3"));

        // Overwrite
        set_metadata(&conn, "schema_version", "4").unwrap();
        let val = get_metadata(&conn, "schema_version").unwrap();
        assert_eq!(val.as_deref(), Some("4"));

        // Non-existent key
        let missing = get_metadata(&conn, "no_such_key").unwrap();
        assert!(missing.is_none());
        cleanup("metadata_ops");
    }

    #[test]
    fn test_list_all_metadata() {
        let conn = temp_db("list_meta");
        insert_file(
            &conn,
            "/a.txt",
            "a.txt",
            10,
            "2025-01-01T00:00:00",
            "txt",
        )
        .unwrap();
        insert_file(
            &conn,
            "/b.txt",
            "b.txt",
            20,
            "2025-01-01T00:00:00",
            "txt",
        )
        .unwrap();
        let fid_a = get_file_id_by_path(&conn, "/a.txt").unwrap().unwrap();
        let fid_b = get_file_id_by_path(&conn, "/b.txt").unwrap().unwrap();

        upsert_document_metadata(
            &conn,
            &DocumentMetadataRecord {
                file_id: fid_a,
                religion: "Islam".to_string(),
                book: "Qur'an".to_string(),
                chapter: None,
                verse: None,
            },
        )
        .unwrap();
        upsert_document_metadata(
            &conn,
            &DocumentMetadataRecord {
                file_id: fid_b,
                religion: "Hinduism".to_string(),
                book: "Bhagavad Gita".to_string(),
                chapter: Some("2".to_string()),
                verse: Some("47".to_string()),
            },
        )
        .unwrap();

        let all = list_all_metadata(&conn).unwrap();
        assert_eq!(all.len(), 2);
        cleanup("list_meta");
    }
}
