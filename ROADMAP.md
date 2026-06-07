# Ocean Library — Roadmap

**Prototype → Ocean 1.0 feature parity**

Target: condensed library of world scriptures with instant boolean search, hierarchical metadata (religion → book → chapter → verse), and zero cloud dependency.

---

## Estado del proyecto

### Fase 1 — Completada ✅

| Stage | Estado | Descripción breve |
|-------|--------|-------------------|
| 1 — Búsqueda | ✅ | Botones AND/OR/NOT, tooltip de sintaxis, paginación, feedback visual |
| 2 — Visor | ✅ | Texto completo, resaltado multi-color, scroll al primer match |
| 3 — Metadata | ✅ | Parser heurístico, 4 campos Tantivy, búsqueda facetada (backend) |
| 4 — Split UI | ✅ | Árbol jerárquico, layout dividido, sidebar simplificada |
| 5 — Polish | ✅ | Skeletons, errores visibles, SettingsPanel, tests Rust |

### Fase 2 — En planificación 🔄

**Objetivo:** que al buscar una palabra o frase el usuario **vea el contenido que busca** — con contexto, resaltado y scroll al match correcto — no solo el nombre del archivo ni un fragmento de 80 caracteres.

**Problema diagnosticado (2025-06):**

| Capa | Qué pasa hoy | Por qué falla la experiencia |
|------|--------------|------------------------------|
| Backend | Tantivy genera snippets de hasta 2000 chars con `<mark>` | El contenido rico **existe** pero no llega bien a la UI |
| `SearchBar` | Dropdown con snippet HTML | `line-clamp-2` → solo 2 líneas visibles |
| `ResultTree` | Preview bajo cada match | `stripHtml()` + `truncate(..., 80)` → pierde resaltado y contexto |
| `uiStore` | Guarda `selectedSnippet` al hacer clic | `DocumentViewer` **no lo lee** |
| `DocumentViewer` | Carga el archivo **entero** vía `read_document` | PDFs largos = muro de texto; scroll al **primer** match del doc, no al del resultado elegido |

**Modelo objetivo (estilo Ocean 1.0):**

```
Buscar → preview legible con resaltado → clic → snippet ampliado del match
                                              → opción de documento completo
                                              → scroll al match concreto
```

---

## Stage 6 — Previews legibles en resultados

**Opción A del análisis.** Solo frontend + CSS. Sin cambios en Rust.

**Duración estimada:** ~2 h · **Riesgo:** bajo · **Dependencias:** ninguna

### Contexto

El backend ya devuelve `snippet` con etiquetas `<mark>` generadas por `SnippetGenerator` en `full_text_search` (`lib.rs`, hasta 2000 caracteres). Ese valor llega intacto a `SearchResult.snippet` en el store, pero la UI lo degrada antes de mostrarlo:

- En `ResultTree.tsx`: `truncate(stripHtml(match.snippet), 80)` elimina HTML y corta a 80 caracteres.
- En `SearchBar.tsx`: el snippet se renderiza con `dangerouslySetInnerHTML` pero la clase `line-clamp-2` limita a dos líneas.

Esta etapa no cambia **qué** se busca ni **cómo** se indexa; solo recupera información que ya tenemos.

### Tasks

| # | Task | Archivo(s) | Detalle |
|---|------|------------|---------|
| 6.1 | Mostrar snippet HTML en `ResultTree` | `ResultTree.tsx` | Eliminar `stripHtml` y `truncate(..., 80)`. Renderizar `match.snippet` con `dangerouslySetInnerHTML`. Mantener `line-clamp-4` o `line-clamp-6` (configurable) para no romper el layout del árbol. Asegurar que los estilos `mark` de `index.css` aplican dentro del panel (herencia CSS). |
| 6.2 | Ampliar preview en dropdown de `SearchBar` | `SearchBar.tsx` | Cambiar `line-clamp-2` → `line-clamp-4` o quitar clamp y usar `max-h-24 overflow-hidden` con gradiente fade al final. Mostrar ruta padre + nombre de archivo (ya existe). Opcional: badge con longitud aproximada del snippet. |
| 6.3 | Unificar estilos de `<mark>` en panel de resultados | `index.css`, `ResultTree.tsx` | Verificar contraste en fondo blanco (`ResultTree`) y fondo oscuro si algún snippet aparece en sidebar. Los snippets de Tantivy usan `<mark>` sin clase; el visor usa `.mark-1`…`.mark-4`. Decidir: dejar amarillo Tantivy en previews y colores por término solo en visor completo. |
| 6.4 | Tooltip o expand al hover (opcional) | `ResultTree.tsx` | Si el snippet sigue truncado visualmente, mostrar popover con snippet completo al hover o clic en icono “expandir”. Evita scroll infinito en el árbol con muchos matches. |
| 6.5 | Accesibilidad del HTML inyectado | `ResultTree.tsx`, `SearchBar.tsx` | Los snippets vienen de Tantivy sobre contenido local indexado por el usuario (confianza local). Documentar en comentario que `dangerouslySetInnerHTML` es intencional. No interpolar query del usuario dentro del HTML. |

### Archivos tocados

```
src/components/ResultTree.tsx   # principal
src/components/SearchBar.tsx    # dropdown
src/index.css                   # estilos mark en contexto árbol
```

### Criterios de éxito

- [ ] Cada nodo hoja del árbol muestra al menos **4–6 líneas** de contexto con la palabra buscada **resaltada en amarillo** (`<mark>`).
- [ ] El dropdown de búsqueda muestra más contexto que antes (mínimo el doble de líneas visibles).
- [ ] No hay regresión en agrupación religión → libro → capítulo.
- [ ] `npx tsc --noEmit` pasa sin errores.

### Qué NO resuelve esta etapa

- Al hacer clic, el visor derecho sigue cargando el documento completo (Stage 7).
- Sigue habiendo un solo match “representativo” por archivo en el índice; si la palabra aparece 10 veces, Tantivy elige un snippet pero el scroll irá al primer match del archivo (Stage 8).

---

## Stage 7 — Visor híbrido: snippet primero, documento después

**Opción B del análisis.** Frontend + uso del store existente. Cambios mínimos en Rust (opcional).

**Duración estimada:** ~3–4 h · **Riesgo:** medio-bajo · **Dependencias:** Stage 6 recomendado (misma UX de snippets)

### Contexto

Hoy el flujo al seleccionar un resultado es:

1. `Layout.handleTreeSelect` / clic en `SearchBar` → `setSelectedDocumentId(path)` + `setSelectedSnippet(snippet)`.
2. `DocumentViewer` observa solo `selectedDocumentId` y `searchQuery` → invoca `read_document` → renderiza **todo** el contenido.

`selectedSnippet` se escribe en `uiStore.ts` pero **nunca se consume**. El usuario pierde el fragmento que vio en los resultados en el instante en que abre el documento.

Esta etapa introduce un **modo focalizado**: primero el snippet del match (lo que el usuario buscaba), después el documento completo bajo demanda.

### Diseño UX propuesto

```
┌─ DocumentViewer ─────────────────────────────────────┐
│  [PDF] mensaje-ridvan.pdf                            │
├──────────────────────────────────────────────────────┤
│  ▼ Match en tu búsqueda                              │
│  ┌────────────────────────────────────────────────┐  │
│  │ ...la <mark>paz</mark> de dios es importante...│  │
│  │     (snippet de Tantivy, hasta ~2000 chars)    │  │
│  └────────────────────────────────────────────────┘  │
│  [ Ver documento completo ]                          │
├──────────────────────────────────────────────────────┤
│  (vacío hasta que el usuario expande)                │
└──────────────────────────────────────────────────────┘
```

Tras clic en “Ver documento completo” → comportamiento actual (Stage 2) con lazy-load.

### Tasks

| # | Task | Archivo(s) | Detalle |
|---|------|------------|---------|
| 7.1 | Leer `selectedSnippet` en `DocumentViewer` | `DocumentViewer.tsx`, `uiStore.ts` | Suscribirse a `selectedSnippet`. Si hay snippet y documento seleccionado desde búsqueda, mostrar bloque “Match en tu búsqueda” **antes** de cargar el doc completo. |
| 7.2 | Estado `viewMode`: `snippet` \| `full` | `uiStore.ts`, `DocumentViewer.tsx` | Nuevo campo `documentViewMode` (default `'snippet'` cuando hay `selectedSnippet`, `'full'` cuando se abre desde sidebar sin búsqueda). `setDocumentViewMode`, reset al cambiar `selectedDocumentId`. |
| 7.3 | Bloque UI del snippet | `DocumentViewer.tsx` | Card con borde cyan, título “Match en tu búsqueda”, `dangerouslySetInnerHTML` del snippet, scroll interno si > ~400px. Mostrar query activa en subtítulo (`searchQuery`). |
| 7.4 | Botón “Ver documento completo” | `DocumentViewer.tsx` | Cambia `documentViewMode` a `'full'` → dispara `read_document` (lazy, como hoy). Skeleton mientras carga. |
| 7.5 | Propagar snippet desde todos los puntos de selección | `Layout.tsx`, `SearchBar.tsx` | Verificar que **siempre** se llama `setSelectedSnippet(result.snippet)` al seleccionar. Si se abre doc sin búsqueda (futuro sidebar), `setSelectedSnippet(null)`. |
| 7.6 | Limpiar snippet al cambiar query | `SearchBar.tsx` o `uiStore` | Si el usuario edita la búsqueda mientras ve un doc, decidir política: (a) mantener snippet viejo hasta nueva selección, o (b) volver a modo snippet-only si la query cambia. **Recomendado:** (a) + banner “Resultado de búsqueda anterior” si query ≠ query al seleccionar. |
| 7.7 | Abrir directamente en modo full (opcional) | `DocumentViewer.tsx` | Doble clic en resultado o botón “Abrir completo” en `ResultTree`. Atajo para usuarios que prefieren el flujo actual. |

### Archivos tocados

```
src/store/uiStore.ts
src/components/DocumentViewer.tsx
src/components/Layout.tsx
src/components/SearchBar.tsx
```

### Criterios de éxito

- [ ] Clic en resultado → visor muestra **inmediatamente** el snippet resaltado (sin esperar `read_document`).
- [ ] Botón “Ver documento completo” carga el texto entero con resaltado multi-color existente.
- [ ] Abrir documento sin búsqueda activa (Welcome → futuro listado) no muestra bloque snippet vacío.
- [ ] Cambiar de resultado A a resultado B actualiza snippet y resetea modo a `'snippet'`.

### Qué NO resuelve esta etapa

- El snippet puede no ser el mismo párrafo que el “primer match” del archivo completo (Stage 8).
- PDFs de una sola línea sin `\n\n` siguen siendo un bloque en modo full (Stage 9).

---

## Stage 8 — Scroll y offset al match correcto

**Complemento de Opción B.** Frontend + ajustes en Rust.

**Duración estimada:** ~4–5 h · **Riesgo:** medio · **Dependencias:** Stage 7

### Contexto

Problemas actuales en `DocumentViewer` + `read_document`:

1. **`find_first_match_offset`** (`lib.rs`) y **`findFirstMatchIndex`** (frontend) buscan la **primera** aparición de cualquier término suelto en todo el documento.
2. Tantivy puede rankear un documento por un match en la página 30; el snippet refleja ese contexto, pero el scroll va a la página 2.
3. Queries con frases (`"paz de dios"`), `AND`, o wildcards: el resaltado del visor usa `extractTerms` / `extract_query_terms`, que **no** replica la semántica de Tantivy.

Objetivo: al expandir a documento completo, llevar al usuario al **mismo contexto** que vio en el snippet.

### Estrategia técnica (por sub-etapas)

#### 8.A — Alinear scroll con texto del snippet (solo frontend)

| # | Task | Detalle |
|---|------|---------|
| 8.A.1 | Extraer texto plano del snippet | Función `snippetToPlainText(html)`: quitar tags, normalizar espacios. |
| 8.A.2 | Buscar substring en documento completo | Tras `read_document`, buscar en `content` una ventana de ~40 chars del centro del snippet plain. Usar búsqueda case-insensitive. |
| 8.A.3 | Scroll al offset encontrado | Reutilizar lógica de párrafo/`scrollIntoView` pero con offset del snippet, no del primer término. |
| 8.A.4 | Fallback | Si no hay match de substring (PDF con espacios distintos al indexar), caer al comportamiento actual (primer término). |

**Ventaja:** sin cambios en Tantivy. **Limitación:** frágil si el snippet trunca bordes o el PDF tiene saltos de línea distintos.

#### 8.B — Offset desde backend (recomendado)

| # | Task | Archivo(s) | Detalle |
|---|------|------------|---------|
| 8.B.1 | Devolver `matchOffset` por resultado de búsqueda | `lib.rs` (`full_text_search`, `run_faceted_search`) | Tras `snippet_from_doc`, calcular offset del **primer término resaltado del snippet** dentro del campo `text` almacenado en Tantivy (mismo doc). Incluir en JSON: `"matchOffset": number \| null`. |
| 8.B.2 | Extender `SearchResult` en frontend | `uiStore.ts` | Campo opcional `matchOffset?: number \| null`. |
| 8.B.3 | Pasar offset al store al seleccionar | `Layout.tsx`, `SearchBar.tsx` | `setSelectedMatchOffset(result.matchOffset)` junto con snippet y path. |
| 8.B.4 | Usar offset en `DocumentViewer` | `DocumentViewer.tsx` | Prioridad: (1) `selectedMatchOffset`, (2) substring del snippet (8.A), (3) primer término. |
| 8.B.5 | Tests Rust | `lib.rs` o `integration_test.rs` | Verificar que `matchOffset` apunta a posición correcta en TXT de prueba. |

#### 8.C — Resaltado coherente con frases

| # | Task | Detalle |
|---|------|---------|
| 8.C.1 | Detectar frases entre comillas en query | En frontend (y opcionalmente Rust), si hay `"..."`, resaltar la frase completa además de términos sueltos. |
| 8.C.2 | Respetar operadores en UI de resaltado | No resaltar tokens `AND`/`OR`/`NOT`. Ya filtrados en `extractTerms`; extender para frases. |

### Criterios de éxito

- [ ] Caso manual: palabra solo en mitad de un PDF largo → scroll llega al párrafo del snippet, no al inicio del archivo.
- [ ] Caso `"frase exacta"`: resaltado en visor muestra la frase unida cuando Tantivy la encontró así.
- [ ] Si offset es null, fallback visible (scroll al inicio o primer término) sin error.
- [ ] Tests de integración actualizados.

---

## Stage 9 — Indexación por fragmentos (solución de fondo)

**Opción C del análisis.** Rust pesado + migración de schema.

**Duración estimada:** ~2–3 días · **Riesgo:** alto · **Dependencias:** Stages 6–8 recomendados primero (validan UX antes de reindexar)

### Contexto

Limitación estructural actual: **1 archivo = 1 documento Tantivy** (`index_document` en `index.rs`). Consecuencias:

- Un PDF de 200 páginas produce **un** hit en resultados aunque la palabra aparezca 50 veces.
- `SnippetGenerator` elige **un** fragmento representativo; no hay un resultado por ocurrencia.
- El árbol jerárquico agrupa por metadatos de archivo, no por versículo real (`verse` siempre `None` en `parser.rs`).

Ocean 1.0 indexaba bloques etiquetados (religión/libro/capítulo/versículo). Para acercarse de verdad hace falta **chunking**.

### Diseño propuesto

```
Antes:  file.pdf  →  1 doc Tantivy (text = todo el PDF)

Después: file.pdf  →  N docs Tantivy
                      - text = párrafo o versículo
                      - path = mismo path (o path + chunk_id)
                      - religion, book, chapter, verse = por chunk
                      - byte_start, byte_end = offsets en archivo (STORED)
```

### Tasks

| # | Task | Archivo(s) | Detalle |
|---|------|------------|---------|
| 9.1 | Diseño de chunking | doc interno / este ROADMAP | Elegir estrategia: (a) split por `\n\n`, (b) por tamaño fijo con solapamiento, (c) por convención de marcadores en TXT, (d) por página PDF. Documentar trade-offs. |
| 9.2 | Nuevos campos Tantivy | `index.rs` | `chunk_id`, `byte_start`, `byte_end` (STORED + opcional INDEXED). Bump `schema_version` → `"4"`. |
| 9.3 | Pipeline de chunking en scan | `extractor.rs`, `lib.rs` | Tras `extract_text_full`, dividir en chunks, indexar cada uno con metadatos heredados del parser de path + offset local. |
| 9.4 | Migración | `lib.rs`, `db.rs` | Al detectar v3→v4: borrar índice + `indexed_files`, reindexar. Mensaje claro al usuario en UI de scan. |
| 9.5 | Resultados múltiples por archivo | `full_text_search`, `ResultTree` | Mismo `path` puede aparecer N veces con snippets distintos. Árbol: agrupar por capítulo → lista de matches (ya soportado parcialmente). |
| 9.6 | `read_document` con rango | `lib.rs` | Nuevo parámetro opcional `byteStart`/`byteEnd` o `chunkId` para leer solo el fragmento + contexto expandido (±500 chars). |
| 9.7 | Parser de versículo | `parser.rs` | Extraer `verse` de convención de nombre o estructura de chunk; actualizar tests en `parser.rs`. |
| 9.8 | Metadatos explícitos (opcional) | `parser.rs`, formato `.ocean.json` | Archivo de manifest por carpeta con religion/book overrides; el parser heurístico queda como fallback. |

### Criterios de éxito

- [ ] Búsqueda de término frecuente devuelve **varios** resultados del mismo PDF con snippets **distintos**.
- [ ] Clic en resultado abre fragmento acotado sin cargar 200 páginas.
- [ ] Reindexación v4 automática tras scan.
- [ ] Corpus sin estructura clara sigue funcionando (1 chunk = archivo entero como fallback).

---

## Stage 10 — Pulido del flujo de búsqueda (opcional, post 6–8)

Mejoras menores que cierran la experiencia una vez visible el contenido buscado.

| # | Task | Detalle |
|---|------|---------|
| 10.1 | Unificar dropdown y árbol | Ocultar dropdown cuando `searchResults.length > 0` y el árbol ya muestra resultados; o dropdown solo como autocompletado rápido. |
| 10.2 | Navegación entre matches | En visor full: “Match anterior / siguiente” dentro del mismo documento. |
| 10.3 | Contador de ocurrencias | “3 de 12 coincidencias en este documento”. |
| 10.4 | Copiar cita | Botón copiar snippet + referencia (libro, capítulo, path). |
| 10.5 | PDF sin párrafos | Fallback de split por `\n` simple o por longitud cuando no hay `\n\n`. |

---

## Matriz de dependencias (Fase 2)

```
Stage 6 (Previews) ─────────────── independiente ← empezar aquí
Stage 7 (Visor híbrido) ────────── recomienda Stage 6
Stage 8 (Offset correcto) ──────── requiere Stage 7
Stage 9 (Chunking) ─────────────── independiente de 6–8, pero validar UX antes
Stage 10 (Pulido) ──────────────── después de 6–8
```

**Orden recomendado de implementación:** 6 → 7 → 8 → (10) → 9

Stage 9 es la inversión más grande; conviene hacerla solo cuando 6–8 confirmen que la UX de “ver lo que busco” funciona con el índice actual.

---

## Resumen de esfuerzo (Fase 2)

| Stage | Enfoque | Esfuerzo | Archivos principales |
|-------|---------|----------|----------------------|
| 6 — Previews legibles | UI resultados | ~2 h | `ResultTree`, `SearchBar`, `index.css` |
| 7 — Visor híbrido | Snippet + full | ~3–4 h | `DocumentViewer`, `uiStore` |
| 8 — Offset correcto | Scroll preciso | ~4–5 h | `lib.rs`, `DocumentViewer` |
| 9 — Chunking | Reindexación | ~2–3 d | `index.rs`, `extractor.rs`, `parser.rs`, `lib.rs` |
| 10 — Pulido | UX extra | ~3–4 h | varios |

---

## Referencia — Fase 1 (histórico)

<details>
<summary>Stages 1–5 (completados) — click para expandir</summary>

### Stage 1 — Búsqueda Visible

Wiring de funciones de Tantivy con UI: botones AND/OR/NOT, tooltip, paginación, feedback visual. **Criterio:** usuario escribe boolean queries con un clic.

### Stage 2 — Visor de Documentos Completo

`read_document`, lazy-load, resaltado multi-término, scroll al primer match. **Criterio:** clic en resultado → documento completo resaltado.

### Stage 3 — Metadata Jerárquico

Parser heurístico, campos Tantivy, schema v3, `search_by_religion` / `search_by_book`. **Criterio:** resultados con religion/book/chapter en JSON.

### Stage 4 — Split-Panel UI

`ResultTree`, layout dividido, conexión árbol → visor. **Criterio:** agrupación religión → libro → capítulo.

### Stage 5 — Polish

Colores por término, skeletons, errores visibles, `SettingsPanel`, tests Rust. **Criterio:** app usable sin mirar consola.

</details>

---

## Backlog (fuera de Fase 2 inmediata)

| Item | Notas |
|------|-------|
| Búsqueda facetada en UI | Backend listo; clic en nodo religión/libro → `search_by_religion` |
| Lista de documentos en sidebar | `list_files` sin usar |
| Búsqueda semántica integrada o eliminada | Sidecar hoy solo hace `console.log` |
| DOCX real | Placeholder en `read_document` |
| Dark mode | No planificado en Fase 2 |
| Actualizar `AGENTS.md` | Schema v3, ResultTree, UI booleana — desalineado con código |

---

*Última actualización: 2025-06-07 — Fase 2 añadida tras análisis de visibilidad del contenido buscado.*
