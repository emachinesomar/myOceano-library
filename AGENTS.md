# Ocean Library — AGENTS.md

## Project Vision

Spiritual/sacred texts research tool inspired by **Ocean Research Library 1.0** (Chad Jones, 1998), a pioneer in digital interfaith Bahá'í studies. Target: condensed library of world scriptures with instant boolean search, hierarchical metadata (religion → book → chapter → verse), and zero cloud dependency.

## Stack

- **Frontend**: React 19 + TypeScript ~5.8 + Tailwind CSS 4 + Zustand 5 + Vite 7
- **Desktop**: Tauri v2 (Rust) with plugins: shell, dialog, opener
- **Backend (Rust)**: Tantivy 0.22 (inverted-index full-text search), rusqlite 0.31 (bundled SQLite), pdf-extract 0.7
- **Sidecar (Python)**: FastAPI + uvicorn + sentence-transformers (semantic search, optional)

## Feature Map (Ocean 1.0 vs Prototype)

| Feature | Ocean 1.0 (1998) | Prototype |
|---------|-----------------|-----------|
| Boolean search (AND / OR / NOT) | ✅ Native | ⚠️ Tantivy soporta nativamente, no hay UI para operadores |
| Proximity / exact phrase (`"..."`) | ✅ Comprueba posiciones relativas | ⚠️ Tantivy soporta phrase queries, no hay UI |
| Highlighting (bold/color) | ✅ Inyecta etiquetas dinámicas | ⚠️ Tantivy `<mark>` tags, no custom colors |
| Metadata jerárquico (religión → libro → capítulo → versículo) | ✅ Etiquetado rígido en archivos | ❌ No existe |
| Split-panel UI (tree results left, full text right) | ✅ Interfaz dividida | ❌ Sidebar genérica + visor de snippet |
| Indexación local sin servidor | ✅ 100% local | ✅ Tauri + Tantivy local |
| Compresión de bloques | ✅ Contenedores locales | ✅ Tantivy ya comprime internamente |
| Resultados ordenados por jerarquía religiosa | ✅ Panel izquierdo jerárquico | ❌ Lista plana |

## Commands

```sh
npm run dev              # Vite dev server only (port 1420)
npm run build            # tsc && vite build
npm run tauri dev        # Tauri dev (launches both Vite + Rust backend)
npm run tauri build      # Production build
npm run tauri            # Tauri CLI passthrough
```

- **TypeScript check**: `npx tsc --noEmit` (tsconfig strict mode, `noUnusedLocals`, `noUnusedParameters`)
- **Rust check**: `cd src-tauri && cargo check`
- **Rust build**: `cd src-tauri && cargo build`
- **Python sidecar** (manual): `cd sidecar && pip install -r requirements.txt && python main.py`

## Architecture

### Frontend (`src/`)

```
src/
  main.tsx                   # Entry: renders <App>
  App.tsx                    # Root: Layout → DocumentViewer or WelcomeScreen
  index.css                  # Tailwind v4 + <mark> highlight styles
  store/
    uiStore.ts               # Zustand: searchQuery, selectedDocumentId, selectedSnippet
  components/
    Layout.tsx               # Shell: Sidebar + top SearchBar + content area
    Sidebar.tsx              # Folder picker + document list + scan_folder trigger
    SearchBar.tsx            # Debounced search → full_text_search → results dropdown
    DocumentViewer.tsx       # Reads selectedSnippet from store, renders with innerHTML
    DocumentList.tsx         # Placeholder, unused in current flow
  lib/
    utils.ts                 # cn() helper
```

### Target Layout (Ocean 1.0 style)

```
┌─────────────────────────────────────────────┐
│  Search Bar (boolean + phrase support)       │
├──────────────┬──────────────────────────────┤
│  Results     │  Document Viewer             │
│  Tree        │  (full text with highlights) │
│  ─ religión  │                              │
│    ├ libro   │                              │
│    │ ├ cap   │                              │
│    │ │ └ v   │                              │
│    └ ...     │                              │
└──────────────┴──────────────────────────────┘
```

### Key Tauri Commands (Rust, `src-tauri/src/lib.rs`)

| Command | Purpose |
|---------|---------|
| `scan_folder` | Scan + index files; auto-detects schema version, incremental indexing by mtime |
| `full_text_search` | Tantivy search with `SnippetGenerator` (2000 char snippets, `<mark>` tags) |
| `list_files` | List indexed files from SQLite |
| `search` | Semantic search via Python sidecar (http://localhost:8000/embed_chunks) |
| `read_document` | Reads raw text files (PDF/DOCX mostly placeholder) |

### Rust Modules (`src-tauri/src/`)

- `main.rs` → calls `lib::run()`
- `lib.rs` → Tauri builder, all commands, app state
- `db.rs` → SQLite schema: `files`, `metadata`, `indexed_files` tables
- `scanner.rs` → walks directory, inserts file metadata into DB
- `extractor.rs` → extracts text: `pdf-extract` for PDFs, raw read for TXT
- `index.rs` → Tantivy Indexer: path + text + metadata fields

### Data Storage

```
%APPDATA%/ocean_library/
  ocean_library.db          # SQLite: files, metadata, indexed_files
  tantivy_index/            # Tantivy search index
```

Schema version stored in `metadata` table (`key="schema_version"`). Current: `"2"`.  
Bump when index structure or extraction logic changes → triggers full reindex.

### Incremental Indexing

- `indexed_files` table tracks path + mtime per file
- On scan: skips files with unchanged mtime
- On schema version mismatch: clears index + `indexed_files`, reindexes everything

### Search Flow (current)

The `full_text_search` command in `lib.rs`:

1. Opens Tantivy index at `%APPDATA%/ocean_library/tantivy_index`
2. Creates `QueryParser` on the `text` field
3. Parses user query string directly (Tantivy handles tokenization, lowercasing, and punctuation stripping internally — same as Ocean 1.0)
4. Runs search with `TopDocs::with_limit(20)` (hardcoded)
5. For each result: generates a snippet using `SnippetGenerator` with `set_max_num_chars(2000)` and `<mark>` tags
6. Returns JSON: `{ path, snippet: "<mark>...</mark>", score }`

### Search Query Syntax (Tantivy QueryParser)

Tantivy's parser accepts these operator formats. The `full_text_search` command passes the raw query string through — **do NOT strip or escape operators**:

```
paz justicia         → OR implícito (matches either term)
paz AND justicia     → intersección (both terms in same doc)
paz OR justicia      → unión (either term)
paz NOT justicia     → resta (docs with paz, excluding justicia)
"paz de dios"        → phrase exacta (posición relativa: paz+1=de, paz+2=dios)
+paz -justicia       → + required, - prohibited (syntax alternativa)
paz~2                → fuzzy: edit distance up to 2
paz*                 → prefix/wildcard: paz, pazguato, pazote
```

Everything above is **already supported** by Tantivy's QueryParser — none of it is wired in the UI (no toggles, no visual feedback, no syntax help).

### Boolean Search Flow (how Tantivy implements it internally)

Same algorithm as Ocean 1.0:

- **AND**: Intersection of doc ID sets in memory
- **OR**: Union of doc ID sets
- **NOT**: Set subtraction
- **Phrase (`"..."`)**: Position-aware — Tantivy stores term positions per field, verifies relative offsets match the phrase tokens sequentially

No custom Rust needed for any of this. Agents should NOT implement boolean logic manually — it's already in the query parser.

### Missing from Tantivy (needs custom work)

| Feature | Why Tantivy can't do it |
|---------|------------------------|
| Hierarchical metadata (religión → libro → capítulo → versículo) | Tantivy has no concept of structured hierarchy; needs custom indexing in separate fields + post-processing |
| Proximity boost (words close together rank higher) | Tantivy ranks by TF-IDF/BM25; phrase query gives exact match boost but no "close but not exact" ranking |
| Custom highlight colors per term | Tantivy SnippetGenerator only wraps in `<mark>`; custom colors need post-processing |
| Block compression | Already handled internally by Tantivy's index format — no action needed |

## Notable Quirks

- **Powershell shell platform**: Use `cmd1; if ($?) { cmd2 }` instead of `&&`
- **Tailwind v4**: Uses `@reference` directive. Class `cn()` helper in `utils.ts`. CSS in `index.css` with `@tailwind` directives (v3 compat mode).
- **<mark> styling**: Defined in `index.css` for search snippet highlighting.
- **Snippet display**: Uses `dangerouslySetInnerHTML` in both SearchBar and DocumentViewer — search returns pre-rendered `<mark>` HTML from Tantivy.
- **Boolean search not wired**: Tantivy query parser supports `AND`, `OR`, `NOT` natively, but the `full_text_search` command passes raw query strings without validation or UI toggles. Do NOT strip operators — pass them through.
- **No eslint config file found** at root (packages installed but unconfigured). No formatter config.
- **No test setup** (no testing deps, no test files).
- **Docx support**: declared in index loop but extraction is a no-op placeholder.
- **Python sidecar**: Spawned automatically in `lib.rs::run()` if `sidecar/main.py` exists. Silently ignored if not present.
- **Search result limit**: hardcoded `TopDocs::with_limit(20)` in `full_text_search`.
