# Ocean Library — Roadmap

**Prototype → Ocean 1.0 feature parity**

Target: condensed library of world scriptures with instant boolean search, hierarchical metadata (religion → book → chapter → verse), and zero cloud dependency.

## Status: ALL STAGES COMPLETE ✅

| Stage | Status | Description |
|-------|--------|-------------|
| 1 — Búsqueda | ✅ | AND/OR/NOT buttons, help tooltip, pagination, visual feedback |
| 2 — Visor | ✅ | Full text viewer, multi-color highlights, scroll-to-match |
| 3 — Metadata | ✅ | Heuristic parser, 4 Tantivy fields, faceted search |
| 4 — Split UI | ✅ | Hierarchical tree, split-panel layout, sidebar cleanup |
| 5 — Polish | ✅ | Highlights per-term, skeletons, error display, settings, ESLint, tests |

**Remaining**: Dark mode toggle, verse-level indexing, DOCX support (not in roadmap).

---

## Stage 1 — Búsqueda Visible (0 cambios en Rust)

Wiring de funciones de Tantivy que ya existen pero no tienen UI. Máximo impacto con mínimo esfuerzo.

### Tasks

| # | Task | Archivos | Esfuerzo |
|---|------|----------|----------|
| 1.1 | Add toggle buttons AND / OR / NOT en SearchBar | `SearchBar.tsx` | ⏱️ 30 min |
| 1.2 | Help tooltip con sintaxis de búsqueda (boolean, phrase, fuzzy) | `SearchBar.tsx` | ⏱️ 20 min |
| 1.3 | Paginación: "ver más resultados" que incrementa TopDocs limit | `lib.rs` + `SearchBar.tsx` | ⏱️ 30 min |
| 1.4 | Feedback visual de operador activo (ej. botón AND se ilumina) | `SearchBar.tsx` + `index.css` | ⏱️ 15 min |
| 1.5 | Limpiar snippets: mostrar path completo del documento en cada resultado | `SearchBar.tsx` | ⏱️ 10 min |

### Dependencias

Ninguna. Se puede hacer ahora mismo.

### Criterio de éxito

- El usuario puede escribir `paz AND justicia` con un clic en AND
- El usuario puede hacer clic en "Ver más resultados" y obtener más de 20
- Tooltip visible con ejemplos de sintaxis
- No se rompe ningún comando Tauri existente

---

## Stage 2 — Visor de Documentos Completo (Rust + frontend)

Pasar de ver snippets a leer documentos enteros con resaltado.

### Tasks

| # | Task | Archivos | Esfuerzo |
|---|------|----------|----------|
| 2.1 | Implementar `read_document` para PDF usando `pdf-extract` | `extractor.rs` → nueva fn `extract_text_full` | ⏱️ 20 min |
| 2.2 | Modificar `read_document` comando para devolver texto completo con offsets | `lib.rs` | ⏱️ 15 min |
| 2.3 | Agregar `read_document` al frontend con lazy-load (leer solo al hacer clic) | `DocumentViewer.tsx` + `uiStore.ts` | ⏱️ 30 min |
| 2.4 | Resaltar términos buscados en el texto completo (post-procesar con las query terms) | `lib.rs` o frontend | ⏱️ 45 min |
| 2.5 | Scroll suave al párrafo del match | `DocumentViewer.tsx` | ⏱️ 15 min |

### Dependencias

Ninguna. Paralelizable con Stage 1.

### Criterio de éxito

- Clic en resultado de búsqueda → muestra documento completo
- Términos buscados aparecen resaltados en amarillo en el texto completo
- Scroll automático al párrafo donde aparece el match
- PDFs se leen correctamente (misma calidad que indexing)
- DOCX sigue siendo placeholder (no es prioridad)

---

## Stage 3 — Metadata Jerárquico (Rust pesado)

El corazón de Ocean 1.0: estructura de religión → libro → capítulo → versículo. Requiere diseño de schema, parsing de documentos existentes, y reindexación.

### Tasks

| # | Task | Archivos | Esfuerzo |
|---|------|----------|----------|
| 3.1 | Diseñar schema de metadatos en SQLite (religión, libro, capítulo, versículo + rangos) | `db.rs` | ⏱️ 30 min |
| 3.2 | Agregar campos a Tantivy: `religion`, `book`, `chapter`, `verse` (STRING + STORED) | `index.rs` | ⏱️ 20 min |
| 3.3 | Crear parser de documentos existentes para extraer metadatos (convención de nombres de archivo) | `extractor.rs` + nuevo módulo `parser.rs` | ⏱️ 1.5 h |
| 3.4 | Modificar scan_folder para indexar metadatos en campos separados | `lib.rs` + `index.rs` | ⏱️ 30 min |
| 3.5 | Bump schema_version → "3" (triggers reindex completo) | `lib.rs` | ⏱️ 5 min |
| 3.6 | Endpoint de búsqueda facetada: `search_by_religion`, `search_by_book` | `lib.rs` | ⏱️ 45 min |

### Dependencias

Ninguna. Pero Stage 4 depende de esta.

### Criterio de éxito

- Los documentos se indexan con religión, libro, capítulo, versículo en campos Tantivy
- Se puede buscar solo dentro de una religión o libro específico
- Schema version bump funciona: detecta cambio y reindexa automáticamente
- Los documentos existentes sin metadatos no se rompen (fallback a texto plano)

---

## Stage 4 — Split-Panel UI (frontend pesado)

Reemplazar la interfaz actual con el layout clásico de Ocean 1.0: árbol jerárquico a izquierda, visor a derecha.

### Tasks

| # | Task | Archivos | Esfuerzo |
|---|------|----------|----------|
| 4.1 | Diseñar componente `ResultTree` con nodos expandibles | `components/ResultTree.tsx` (nuevo) | ⏱️ 1 h |
| 4.2 | Implementar agrupación de resultados por religión → libro → capítulo | `ResultTree.tsx` + `uiStore.ts` | ⏱️ 1 h |
| 4.3 | Reemplazar Layout actual con split panel | `Layout.tsx` | ⏱️ 30 min |
| 4.4 | Conectar clic en nodo del árbol con apertura en visor derecho | `ResultTree.tsx` + `DocumentViewer.tsx` | ⏱️ 20 min |
| 4.5 | Ordenar resultados por jerarquía religiosa (no por score) | frontend sorting | ⏱️ 30 min |
| 4.6 | Limpiar Sidebar genérica y DocumentList placeholder | `Sidebar.tsx`, `DocumentList.tsx` | ⏱️ 20 min |

### Dependencias

Requiere Stage 3 (metadatos jerárquicos) para los datos del árbol.

### Criterio de éxito

- Resultados aparecen agrupados en árbol: Religión → Libro → Capítulo
- Clic en capítulo → muestra versículos con matches
- Clic en versículo → abre en visor derecho con resaltado
- Sidebar original se elimina o queda como panel de settings
- Responsive: el split panel funciona en ventanas chicas (se colapsa el árbol)

---

## Stage 5 — Polish Final (frontend + opcional)

Cierre de features, UX, y calidad.

### Tasks

| # | Task | Archivos | Esfuerzo |
|---|------|----------|----------|
| 5.1 | Colores de resaltado personalizados por término (ej. primer término en amarillo, segundo en verde) | frontend + CSS | ⏱️ 45 min |
| 5.2 | Estados de carga con skeleton screens | `DocumentViewer.tsx`, `SearchBar.tsx` | ⏱️ 30 min |
| 5.3 | Estados de error visibles (no solo console.log) | todos los componentes | ⏱️ 30 min |
| 5.4 | Configuración de usuario: carpeta de índice, limpiar caché, tema | nuevo `SettingsPanel.tsx` | ⏱️ 1 h |
| 5.5 | Tests unitarios en Rust (extractor, index, db) | `src-tauri/tests/` | ⏱️ 1.5 h |
| 5.6 | Tests de integración feliz (scan → search → view) | `src-tauri/tests/` | ⏱️ 1 h | ✅ Done |
| 5.7 | Configurar ESLint + Prettier | `eslint.config.*`, `.prettierrc` | ⏱️ 30 min |

### Dependencias

Ideal después de Stages 1-4, pero 5.5 y 5.6 se pueden empezar antes.

### Criterio de éxito

- No hay console.log de errores — todo se muestra al usuario
- ESLint + Prettier configurados y funcionando
- Tests de Rust pasan en `cargo test`
- Tests de frontend (si se agregan) pasan
- App se siente sólida, no frágil

---

## Matriz de Dependencias

```
Stage 1 (Búsqueda) ── independiente
Stage 2 (Visor) ───── independiente
Stage 3 (Metadata) ── independiente ──┐
Stage 4 (Split UI) ───────────────────┴─ requiere Stage 3
Stage 5 (Polish) ──── después de 1-4 (ideal)
```

Stages 1, 2, y 3 se pueden ejecutar en paralelo. Stage 4 espera a Stage 3.

## Resumen de esfuerzo

| Stage | Esfuerzo estimado | Líneas nuevas aprox. |
|-------|------------------|---------------------|
| 1 — Búsqueda | ~2 h | 100-150 |
| 2 — Visor | ~2 h | 150-200 |
| 3 — Metadata | ~3.5 h | 300-400 |
| 4 — Split UI | ~4 h | 400-600 |
| 5 — Polish | ~5.5 h | 300-500 |
| **Total** | **~17 h** | **~1,250-1,850** |
