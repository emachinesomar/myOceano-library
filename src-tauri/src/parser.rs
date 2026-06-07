//! Stage 3 heuristic metadata parser.
//!
//! Derives religion / book / chapter / verse labels from a file's path
//! and filename. We index **one Tantivy document per file** in Stage 3, so
//! the parser only needs to return a single record per path — verse-level
//! extraction is intentionally left for a future stage.
//!
//! ## Strategy
//!
//! Detection runs as a small pipeline; the first match wins for each field.
//!
//! 1. **Religion** — walk the path components bottom-up and match each
//!    component case-insensitively against a list of known aliases
//!    (English + Spanish variants). A hit is mapped to a canonical display
//!    name (e.g. `"biblia"` → `"Christianity"`).
//! 2. **Book** — use the parent folder name, falling back to the
//!    grandparent if the parent is a generic "root" name
//!    (`samples`, `documents`, `library`, etc.) or equal to the scanned
//!    root. The chosen name is cleaned (underscores → spaces, parens
//!    dropped, title-cased).
//! 3. **Chapter** — scan the filename for, in order of priority:
//!    - a 4-digit year in `[1900, 2099]`
//!    - a 6-digit `YYMMDD` date
//!    - a parenthesized number
//!    - a standalone number (first digit run)
//! 4. **Verse** — always `None` for Stage 3.
//!
//! If no religion is found in the path, the default `"Unknown"` is used so
//! downstream grouping never has to handle a `None` case.

use std::path::Path;

/// Canonical metadata extracted from a single file's path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentMetadata {
    pub religion: String,
    pub book: String,
    pub chapter: Option<String>,
    pub verse: Option<String>,
}

/// Known religion aliases (case-insensitive). Each alias maps to a single
/// canonical display name. New entries can be appended freely — order does
/// not affect correctness, only the priority when the same string would
/// match multiple buckets (which we avoid by keeping aliases disjoint).
const KNOWN_RELIGIONS: &[(&str, &str)] = &[
    // Bahá'í family
    ("bahai", "Bahá'í"),
    ("baha'i", "Bahá'í"),
    ("baha", "Bahá'í"),
    ("fe baha'i", "Bahá'í"),
    ("fe bahai", "Bahá'í"),
    // Christianity
    ("cristianismo", "Christianity"),
    ("christianity", "Christianity"),
    ("cristiano", "Christianity"),
    ("biblia", "Christianity"),
    ("bible", "Christianity"),
    // Islam
    ("islam", "Islam"),
    ("islamic", "Islam"),
    ("islamismo", "Islam"),
    ("coran", "Islam"),
    ("quran", "Islam"),
    ("koran", "Islam"),
    // Hinduism
    ("hinduismo", "Hinduism"),
    ("hindu", "Hinduism"),
    ("hinduism", "Hinduism"),
    // Buddhism
    ("budismo", "Buddhism"),
    ("buddhism", "Buddhism"),
    ("budista", "Buddhism"),
    // Judaism
    ("judaismo", "Judaism"),
    ("judaísmo", "Judaism"),
    ("judaism", "Judaism"),
    ("judio", "Judaism"),
    ("judío", "Judaism"),
    ("jewish", "Judaism"),
    // Sikhism
    ("sijismo", "Sikhism"),
    ("sikh", "Sikhism"),
    ("sikhism", "Sikhism"),
    // Zoroastrianism
    ("zoroastrismo", "Zoroastrianism"),
    ("zoroastrianism", "Zoroastrianism"),
];

/// Folder names we treat as "generic root" — when the parent of a file
/// is one of these, we look one level up (or fall back to the filename
/// stem) for a meaningful book name.
const GENERIC_PARENT_NAMES: &[&str] = &[
    "samples",
    "sample",
    "documents",
    "docs",
    "library",
    "libros",
    "books",
    "corpus",
];

const DEFAULT_RELIGION: &str = "Unknown";

/// Detect the religion for `path` by scanning path components for any
/// alias listed in [`KNOWN_RELIGIONS`]. Returns `None` if nothing matches.
fn detect_religion(path: &Path) -> Option<String> {
    for component in path.components() {
        let raw = match component.as_os_str().to_str() {
            Some(s) => s,
            None => continue,
        };
        // Lowercase + trim diacritics-free comparison. We don't do NFKD
        // normalization because the alias list is small enough to keep
        // diacritic variants explicit ("judaísmo" vs "judaismo").
        let needle = raw.to_lowercase();
        for (alias, canonical) in KNOWN_RELIGIONS {
            if needle == *alias {
                return Some((*canonical).to_string());
            }
        }
    }
    None
}

/// Strip the file extension from `path` and return the bare stem.
fn filename_stem(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
}

/// True if `parent` should be treated as a generic container and we
/// should look one level up for a more meaningful book name.
fn is_generic_parent(parent: &Path) -> bool {
    let name = match parent.file_name().and_then(|s| s.to_str()) {
        Some(s) => s.to_lowercase(),
        None => return true,
    };
    GENERIC_PARENT_NAMES.iter().any(|g| *g == name)
}

/// Clean a raw book-name candidate: replace underscores with spaces,
/// drop parenthesized content, collapse whitespace, and title-case.
fn clean_book_name(raw: &str) -> String {
    // Replace underscores with spaces.
    let mut s = raw.replace('_', " ");

    // Strip parenthesized runs entirely (e.g. "(CAST)", "(2024)").
    let mut in_paren: i32 = 0;
    let mut stripped = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '(' => in_paren += 1,
            ')' => {
                if in_paren > 0 {
                    in_paren -= 1;
                }
            }
            _ if in_paren == 0 => stripped.push(c),
            _ => {}
        }
    }
    s = stripped;

    // Collapse whitespace runs and trim.
    let parts: Vec<&str> = s.split_whitespace().collect();
    s = parts.join(" ");

    // Title-case every word. The first character of each word becomes
    // uppercase and the rest are lowercased so the result is predictable
    // regardless of the original casing of the filename.
    s.split_whitespace()
        .map(title_case_word)
        .collect::<Vec<_>>()
        .join(" ")
}

fn title_case_word(w: &str) -> String {
    let mut chars = w.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    let rest: String = chars.collect();
    let mut out = String::with_capacity(w.len());
    out.extend(first.to_uppercase());
    out.push_str(&rest.to_lowercase());
    out
}

/// Try to extract a chapter token from the filename stem. Returns the
/// chapter string plus a `(start, end)` byte range so the caller can
/// remove it from the stem when computing the book name.
fn extract_chapter_with_range(stem: &str) -> Option<(String, usize, usize)> {
    // 1. 4-digit year 1900-2099.
    if let Some((year, s, e)) = find_year(stem) {
        return Some((year, s, e));
    }
    // 2. 6-digit YYMMDD.
    if let Some((date, s, e)) = find_six_digit_date(stem) {
        return Some((date, s, e));
    }
    // 3. Parenthesized number, e.g. "(2024)" or "(181)".
    if let Some((num, s, e)) = find_parenthesized_number(stem) {
        return Some((num, s, e));
    }
    // 4. First standalone number.
    if let Some((num, s, e)) = find_first_number(stem) {
        return Some((num, s, e));
    }
    None
}

fn find_year(s: &str) -> Option<(String, usize, usize)> {
    // Walk all 4-digit windows where the first two chars are "19" or "20".
    let bytes = s.as_bytes();
    let mut i = 0;
    while i + 4 <= bytes.len() {
        let w = &bytes[i..i + 4];
        if w.iter().all(|b| b.is_ascii_digit()) {
            let prefix = (w[0], w[1]);
            if prefix == (b'1', b'9') || prefix == (b'2', b'0') {
                let candidate = std::str::from_utf8(w).ok()?.to_string();
                // Guard against false matches like "12345" — ensure the
                // digit before/after is non-digit (or string boundary).
                let before_ok = i == 0 || !bytes[i - 1].is_ascii_digit();
                let after_ok = i + 4 == bytes.len() || !bytes[i + 4].is_ascii_digit();
                if before_ok && after_ok {
                    return Some((candidate, i, i + 4));
                }
            }
        }
        i += 1;
    }
    None
}

fn find_six_digit_date(s: &str) -> Option<(String, usize, usize)> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i + 6 <= bytes.len() {
        let w = &bytes[i..i + 6];
        if w.iter().all(|b| b.is_ascii_digit()) {
            let before_ok = i == 0 || !bytes[i - 1].is_ascii_digit();
            let after_ok = i + 6 == bytes.len() || !bytes[i + 6].is_ascii_digit();
            if before_ok && after_ok {
                return Some((std::str::from_utf8(w).ok()?.to_string(), i, i + 6));
            }
        }
        i += 1;
    }
    None
}

fn find_parenthesized_number(s: &str) -> Option<(String, usize, usize)> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'(' {
            // Collect digit run after '('.
            let start = i + 1;
            let mut j = start;
            while j < bytes.len() && bytes[j].is_ascii_digit() {
                j += 1;
            }
            if j > start && j < bytes.len() && bytes[j] == b')' {
                let num = std::str::from_utf8(&bytes[start..j]).ok()?.to_string();
                return Some((num, i, j + 1));
            }
            // No digit run, skip past '('.
            i = start;
        } else {
            i += 1;
        }
    }
    None
}

fn find_first_number(s: &str) -> Option<(String, usize, usize)> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            let num = std::str::from_utf8(&bytes[start..i]).ok()?.to_string();
            return Some((num, start, i));
        }
        i += 1;
    }
    None
}

/// Strip every ASCII-digit run and every parenthesized run from `s`,
/// collapse whitespace, and return the result. Used to derive a clean
/// book name from a filename stem: "Mensaje de Ridván 181 (2024) (CAST)"
/// becomes "Mensaje de Ridván".
///
/// Iterates by `char` (not byte) so multi-byte UTF-8 characters in the
/// filename stem are preserved correctly.
fn strip_digits_and_parens(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_paren: i32 = 0;
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '(' => {
                in_paren += 1;
            }
            ')' => {
                if in_paren > 0 {
                    in_paren -= 1;
                }
            }
            _ if in_paren > 0 => {}
            _ if c.is_ascii_digit() => {
                // Consume the rest of the ASCII-digit run.
                while let Some(&next) = chars.peek() {
                    if next.is_ascii_digit() {
                        chars.next();
                    } else {
                        break;
                    }
                }
            }
            _ => {
                out.push(c);
            }
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Decide the book name for `path`. Strategy:
/// 1. Start from the parent folder name.
/// 2. If the parent is generic, try the grandparent (unless that is also
///    generic or the path root).
/// 3. If no meaningful parent is available, fall back to the filename
///    stem, with all digit runs and parenthesized content stripped.
/// 4. Always run the result through `clean_book_name`.
fn detect_book(path: &Path) -> String {
    let parent = path.parent();
    let stem = filename_stem(path);

    let raw_candidate: String = match parent {
        None => strip_digits_and_parens(&stem),
        Some(p) => {
            let parent_name = p
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            if is_generic_parent(p) {
                // Try grandparent.
                if let Some(gp) = p.parent() {
                    if !is_generic_parent(gp) {
                        if let Some(gp_name) = gp.file_name().and_then(|s| s.to_str()) {
                            if !gp_name.is_empty() {
                                gp_name.to_string()
                            } else {
                                strip_digits_and_parens(&stem)
                            }
                        } else {
                            strip_digits_and_parens(&stem)
                        }
                    } else {
                        strip_digits_and_parens(&stem)
                    }
                } else {
                    strip_digits_and_parens(&stem)
                }
            } else if !parent_name.is_empty() {
                parent_name
            } else {
                strip_digits_and_parens(&stem)
            }
        }
    };

    clean_book_name(&raw_candidate)
}

/// Top-level entry point: parse a single file path into structured
/// metadata. Never panics and never returns `None` — falls back to
/// `"Unknown"` and the filename stem when detection fails.
pub fn parse_metadata(path: &Path) -> DocumentMetadata {
    let religion = detect_religion(path).unwrap_or_else(|| DEFAULT_RELIGION.to_string());

    // If the religion was detected from a path component that we would
    // otherwise use as the book name, we'd double-count. Skip the book
    // detection override — `detect_book` already uses the parent folder,
    // not the religion-matched component, so this is fine in practice.

    let book = detect_book(path);

    let chapter = extract_chapter_with_range(&filename_stem(path)).map(|(c, _, _)| c);

    DocumentMetadata {
        religion,
        book,
        chapter,
        verse: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn p(s: &str) -> PathBuf {
        PathBuf::from(s)
    }

    #[test]
    fn unknown_when_no_religion_in_path() {
        let meta = parse_metadata(&p("samples/Mensaje de Ridván 181 (2024) (CAST).pdf"));
        assert_eq!(meta.religion, "Unknown");
        assert_eq!(meta.book, "Mensaje De Ridván");
        // Year 2024 wins over standalone "181" per the priority order.
        assert_eq!(meta.chapter.as_deref(), Some("2024"));
        assert_eq!(meta.verse, None);
    }

    #[test]
    fn six_digit_date_in_filename() {
        let meta = parse_metadata(&p(
            "samples/260104 CUJ sobre la Conferencia de los Consejeros (CAST).pdf",
        ));
        assert_eq!(meta.religion, "Unknown");
        // The 6-digit date sits at the start, so the book is what follows.
        assert!(meta.book.starts_with("Cuj"), "got: {}", meta.book);
        assert_eq!(meta.chapter.as_deref(), Some("260104"));
    }

    #[test]
    fn religion_detected_from_subfolder() {
        let meta = parse_metadata(&p(
            "library/Bahai/Mensaje de Ridván 181 (2024).pdf",
        ));
        assert_eq!(meta.religion, "Bahá'í");
        assert_eq!(meta.book, "Bahai");
    }

    #[test]
    fn religion_spanish_alias() {
        let meta = parse_metadata(&p("corpus/Biblia/Genesis 1.pdf"));
        assert_eq!(meta.religion, "Christianity");
        assert_eq!(meta.book, "Biblia");
    }

    #[test]
    fn parenthesized_number_when_no_year() {
        let meta = parse_metadata(&p("samples/Capitulo (42) notas.pdf"));
        // No year, no 6-digit date — falls through to parenthesized.
        assert_eq!(meta.chapter.as_deref(), Some("42"));
    }

    #[test]
    fn standalone_number_last_resort() {
        let meta = parse_metadata(&p("samples/Libro 7.pdf"));
        // "7" has no 4-digit year prefix, no 6-digit date, no parens.
        assert_eq!(meta.chapter.as_deref(), Some("7"));
    }

    #[test]
    fn no_chapter_when_no_digits() {
        let meta = parse_metadata(&p("samples/Introduccion.pdf"));
        assert_eq!(meta.chapter, None);
    }

    #[test]
    fn cleans_underscores_and_title_cases() {
        let name = clean_book_name("kitab_i_iqan");
        assert_eq!(name, "Kitab I Iqan");
    }
}
