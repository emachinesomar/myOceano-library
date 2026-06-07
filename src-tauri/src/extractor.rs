use std::path::Path;
use std::fs;
use pdf_extract::extract_text;

/// Extract the full text content from a file (TXT or PDF).
///
/// Returns the raw text. For unsupported extensions (e.g. DOCX) the string
/// `"Unsupported"` is returned so callers can detect that case explicitly.
pub fn extract_text_full(path: &Path) -> String {
    println!("DEBUG: Extracting text from: {:?}", path);
    let extension = path.extension().and_then(|os| os.to_str()).unwrap_or("unknown");
    match extension {
        "txt" => {
            fs::read_to_string(path).unwrap_or_else(|_| "Error reading".to_string())
        },
        "pdf" => {
            // pdf-extract maneja mucho mejor las tablas de encoding (ToUnicode)
            match extract_text(path) {
                Ok(text) => text,
                Err(e) => {
                    println!("DEBUG: Error reading PDF {:?}: {:?}", path, e);
                    "Error reading PDF".to_string()
                },
            }
        },
        _ => "Unsupported".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_extract_text_full_txt() {
        let dir = std::env::temp_dir().join("ocean_test_extract");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.txt");
        std::fs::write(&path, "Hello World").unwrap();
        let result = extract_text_full(&path);
        assert_eq!(result, "Hello World");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_extract_text_full_txt_multiline() {
        let dir = std::env::temp_dir().join("ocean_test_extract_ml");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("multiline.txt");
        std::fs::write(&path, "Line 1\nLine 2\nLine 3").unwrap();
        let result = extract_text_full(&path);
        assert_eq!(result, "Line 1\nLine 2\nLine 3");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_extract_text_full_txt_empty() {
        let dir = std::env::temp_dir().join("ocean_test_extract_empty");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("empty.txt");
        std::fs::write(&path, "").unwrap();
        let result = extract_text_full(&path);
        assert_eq!(result, "");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_extract_text_full_unsupported() {
        let dir = std::env::temp_dir().join("ocean_test_extract2");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.docx");
        std::fs::write(&path, "fake").unwrap();
        let result = extract_text_full(&path);
        assert!(result.contains("Unsupported"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_extract_text_full_unknown_extension() {
        let dir = std::env::temp_dir().join("ocean_test_extract_unknown");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("file.xyz");
        std::fs::write(&path, "content").unwrap();
        let result = extract_text_full(&path);
        assert_eq!(result, "Unsupported");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_extract_text_full_nonexistent_file() {
        let path = PathBuf::from("/nonexistent/path/to/file.txt");
        let result = extract_text_full(&path);
        // Should return error message, not panic
        assert_eq!(result, "Error reading");
    }
}
