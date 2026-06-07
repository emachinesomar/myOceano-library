use tantivy::schema::*;
use tantivy::{Index, IndexWriter, IndexReader, doc};
use tantivy::query::{BooleanQuery, Occur, Query, QueryParser, TermQuery};
use tantivy::schema::IndexRecordOption;
use std::path::Path;
use std::fs;

pub struct Indexer {
    schema: Schema,
    index: Index,
}

impl Indexer {
    /// Build the schema with all current fields.
    ///
    /// Kept as a free function so tests and Stage 4 helpers can build the
    /// same schema without having to instantiate an `Indexer` first.
    pub fn build_schema() -> Schema {
        let mut schema_builder = Schema::builder();
        // Core fields.
        schema_builder.add_text_field("path", STORED | STRING);
        schema_builder.add_text_field("text", STORED | TEXT);
        schema_builder.add_text_field("metadata", STORED | TEXT);
        // Stage 3: hierarchical metadata. STRING (exact match) + STORED.
        schema_builder.add_text_field("religion", STORED | STRING);
        schema_builder.add_text_field("book", STORED | STRING);
        schema_builder.add_text_field("chapter", STORED | STRING);
        schema_builder.add_text_field("verse", STORED | STRING);
        schema_builder.build()
    }

    /// Open or create the index at `index_path`. Recovers gracefully if
    /// the on-disk schema does not match the expected one — the old
    /// directory is removed and a fresh index is created.
    pub fn new(index_path: &Path) -> Result<Self, tantivy::TantivyError> {
        let schema = Self::build_schema();

        if !index_path.exists() {
            fs::create_dir_all(index_path)?;
        }

        let index = if index_path.join("meta.json").exists() {
            // Try to open; on schema mismatch / corruption, recreate.
            match Index::open_in_dir(index_path) {
                Ok(idx) => idx,
                Err(e) => {
                    eprintln!(
                        "DEBUG: Index open failed ({}); recreating with current schema",
                        e
                    );
                    if index_path.exists() {
                        let _ = fs::remove_dir_all(index_path);
                    }
                    fs::create_dir_all(index_path)?;
                    Index::create_in_dir(index_path, schema.clone())?
                }
            }
        } else {
            Index::create_in_dir(index_path, schema.clone())?
        };

        Ok(Indexer { schema, index })
    }

    /// Index a single document with its hierarchical metadata.
    ///
    /// `religion`, `book` are required; `chapter` and `verse` are stored
    /// as empty strings when `None` to keep the schema flat and avoid
    /// per-document `Option` handling at the index layer.
    pub fn index_document(
        &mut self,
        path: &str,
        text: &str,
        metadata: &str,
        religion: &str,
        book: &str,
        chapter: Option<&str>,
        verse: Option<&str>,
    ) -> Result<(), tantivy::TantivyError> {
        let mut writer: IndexWriter = self.index.writer(50_000_000)?;

        let path_field = self.schema.get_field("path").unwrap();
        let text_field = self.schema.get_field("text").unwrap();
        let metadata_field = self.schema.get_field("metadata").unwrap();
        let religion_field = self.schema.get_field("religion").unwrap();
        let book_field = self.schema.get_field("book").unwrap();
        let chapter_field = self.schema.get_field("chapter").unwrap();
        let verse_field = self.schema.get_field("verse").unwrap();

        writer.add_document(doc!(
            path_field => path,
            text_field => text,
            metadata_field => metadata,
            religion_field => religion,
            book_field => book,
            chapter_field => chapter.unwrap_or(""),
            verse_field => verse.unwrap_or(""),
        ))?;

        writer.commit()?;
        Ok(())
    }

    /// Run a full-text search and return the matching documents.
    pub fn search(
        &self,
        query_str: &str,
        limit: usize,
    ) -> Result<Vec<SearchResult>, tantivy::TantivyError> {
        use tantivy::collector::TopDocs;

        let reader: IndexReader = self.index.reader()?;
        let searcher = reader.searcher();

        let text_field = self.schema.get_field("text").unwrap();
        let path_field = self.schema.get_field("path").unwrap();

        let query_parser = QueryParser::for_index(&self.index, vec![text_field]);
        let parsed_query = query_parser.parse_query(query_str)?;

        let top_docs = searcher.search(&parsed_query, &TopDocs::with_limit(limit))?;

        let mut results = Vec::new();
        for (score, doc_address) in top_docs {
            let doc: tantivy::TantivyDocument = searcher.doc(doc_address)?;

            let path = doc
                .get_first(path_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let text = doc
                .get_first(text_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let snippet = if text.len() > 200 { &text[..200] } else { &text };

            results.push(SearchResult {
                path,
                snippet: snippet.to_string(),
                score,
            });
        }

        Ok(results)
    }

    /// Read the cached index for faceted search. Used by the public
    /// `search_by_religion` / `search_by_book` Tauri commands, which need
    /// access to the live `Index` (not the wrapping `Indexer`) so they
    /// can build a `BooleanQuery` over a metadata field.
    pub fn raw_index(&self) -> &Index {
        &self.index
    }

    /// Build a `BooleanQuery` that AND-combines the parsed user query on
    /// the `text` field with a `TermQuery` on `facet_field = facet_value`.
    /// Returns the combined query, ready to hand to `searcher.search`.
    pub fn build_facet_query(
        &self,
        user_query: &str,
        facet_field_name: &str,
        facet_value: &str,
    ) -> Result<Box<dyn Query>, tantivy::TantivyError> {
        let text_field = self.schema.get_field("text").unwrap();
        let facet_field = self
            .schema
            .get_field(facet_field_name)
            .map_err(|_| tantivy::TantivyError::FieldNotFound(facet_field_name.to_string()))?;

        let query_parser = QueryParser::for_index(&self.index, vec![text_field]);
        let parsed = query_parser.parse_query(user_query)?;

        let term = tantivy::Term::from_field_text(facet_field, facet_value);
        let term_query = TermQuery::new(term, IndexRecordOption::Basic);

        let combined: BooleanQuery = vec![
            (Occur::Must, parsed),
            (Occur::Must, Box::new(term_query) as Box<dyn Query>),
        ]
        .into();

        Ok(Box::new(combined))
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SearchResult {
    pub path: String,
    pub snippet: String,
    pub score: f32,
}
