import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore } from "../store/uiStore";
import { getFileExtension, getFilename } from "../lib/pathUtils";
import { cn } from "../lib/utils";

const OPERATOR_PATTERN = /^(?:and|or|not)$/i;

function extractTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.trim().replace(/^["']|["']$/g, ""))
    .map((t) => t.replace(/^[+-]/, ""))
    .map((t) => t.replace(/\*$/, ""))
    .map((t) => t.split("~")[0] ?? "")
    .filter((t) => t.length > 0 && !OPERATOR_PATTERN.test(t))
    .map((t) => t.toLowerCase());
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ParagraphInfo {
  text: string;
  start: number;
}

function splitParagraphs(content: string): ParagraphInfo[] {
  const result: ParagraphInfo[] = [];
  const regex = /\n\s*\n/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const text = content.slice(cursor, match.index);
    if (text.length > 0) {
      result.push({ text, start: cursor });
    }
    cursor = match.index + match[0].length;
  }
  const tail = content.slice(cursor);
  if (tail.length > 0) {
    result.push({ text: tail, start: cursor });
  }
  if (result.length === 0 && content.length > 0) {
    result.push({ text: content, start: 0 });
  }
  return result;
}

function findFirstMatchIndex(content: string, terms: string[]): number {
  if (terms.length === 0) return -1;
  const lower = content.toLowerCase();
  let best = -1;
  for (const t of terms) {
    const idx = lower.indexOf(t);
    if (idx >= 0 && (best === -1 || idx < best)) {
      best = idx;
    }
  }
  return best;
}

function highlightContent(content: string, terms: string[]): string {
  if (terms.length === 0) return content;
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const pattern = sorted.map(escapeRegex).join("|");
  const termToClass = new Map<string, string>();
  terms.forEach((term, idx) => {
    termToClass.set(term.toLowerCase(), `mark-${(idx % 4) + 1}`);
  });
  return content.replace(new RegExp(`(${pattern})`, "gi"), (match) => {
    const cls = termToClass.get(match.toLowerCase()) ?? "mark-1";
    return `<mark class="${cls}">${match}</mark>`;
  });
}

function DocumentSkeleton() {
  const bars = ["w-full", "w-11/12", "w-4/5", "w-full", "w-3/4", "w-5/6"];
  return (
    <div className="p-6 space-y-4 animate-pulse">
      {bars.map((width, i) => (
        <div key={i} className={cn("h-4 bg-slate-200 rounded", width)} />
      ))}
    </div>
  );
}

export function DocumentViewer() {
  const selectedDocumentId = useUIStore((s) => s.selectedDocumentId);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const selectedSnippet = useUIStore((s) => s.selectedSnippet);
  const documentViewMode = useUIStore((s) => s.documentViewMode);
  const setDocumentViewMode = useUIStore((s) => s.setDocumentViewMode);

  const documentContent = useUIStore((s) => s.documentContent);
  const documentLoading = useUIStore((s) => s.documentLoading);
  const documentError = useUIStore((s) => s.documentError);

  const setDocumentContent = useUIStore((s) => s.setDocumentContent);
  const setDocumentMatchOffset = useUIStore((s) => s.setDocumentMatchOffset);
  const setDocumentLoading = useUIStore((s) => s.setDocumentLoading);
  const setDocumentError = useUIStore((s) => s.setDocumentError);
  const resetDocument = useUIStore((s) => s.resetDocument);

  const targetRef = useRef<HTMLDivElement | null>(null);
  const loadedDocId = useRef<string | null>(null);
  const hasScrolled = useRef<string | null>(null);

  const [hasContent, setHasContent] = useState(false);

  const terms = extractTerms(searchQuery);
  const showSnippetOnly =
    documentViewMode === "snippet" && Boolean(selectedSnippet) && Boolean(searchQuery.trim());
  const shouldLoadFull = Boolean(selectedDocumentId) && !showSnippetOnly;

  useEffect(() => {
    if (!selectedDocumentId) {
      if (loadedDocId.current !== null) {
        resetDocument();
        loadedDocId.current = null;
        hasScrolled.current = null;
        setHasContent(false);
      }
      return;
    }

    if (!shouldLoadFull) {
      resetDocument();
      loadedDocId.current = null;
      hasScrolled.current = null;
      setHasContent(false);
      return;
    }

    if (loadedDocId.current === selectedDocumentId) return;

    let cancelled = false;
    loadedDocId.current = selectedDocumentId;
    hasScrolled.current = null;
    setDocumentLoading(true);
    setDocumentError(null);
    setDocumentContent(null);
    setDocumentMatchOffset(null);
    setHasContent(false);

    (async () => {
      try {
        const result = await invoke<{
          content: string;
          matchOffset: number | null;
        }>("read_document", {
          path: selectedDocumentId,
          query: searchQuery || null,
        });
        if (cancelled) return;
        setDocumentContent(result.content);
        setDocumentMatchOffset(result.matchOffset);
        setDocumentLoading(false);
        setHasContent(true);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setDocumentError(message);
        setDocumentLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selectedDocumentId,
    searchQuery,
    shouldLoadFull,
    setDocumentContent,
    setDocumentError,
    setDocumentLoading,
    setDocumentMatchOffset,
    resetDocument,
  ]);

  const paragraphs = documentContent ? splitParagraphs(documentContent) : [];
  const matchIndex = documentContent ? findFirstMatchIndex(documentContent, terms) : -1;
  const targetParagraphIndex =
    matchIndex >= 0
      ? paragraphs.findIndex((p) => p.start <= matchIndex && matchIndex < p.start + p.text.length)
      : -1;

  useEffect(() => {
    if (!hasContent || showSnippetOnly) return;
    if (targetParagraphIndex < 0) return;
    if (hasScrolled.current === selectedDocumentId) return;
    const el = targetRef.current;
    if (!el) return;
    hasScrolled.current = selectedDocumentId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [targetParagraphIndex, hasContent, selectedDocumentId, showSnippetOnly]);

  const fileName = selectedDocumentId ? getFilename(selectedDocumentId) : "Unknown";
  const fileType = selectedDocumentId ? getFileExtension(selectedDocumentId) : "FILE";

  return (
    <div className="h-full flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-sm shadow-slate-200/50 overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0",
              fileType === "PDF" && "bg-red-100 text-red-700",
              fileType === "TXT" && "bg-sky-100 text-sky-700",
              fileType !== "PDF" && fileType !== "TXT" && "bg-slate-200 text-slate-600"
            )}
          >
            {fileType}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-800 truncate">{fileName}</h2>
            <p className="text-xs text-slate-500 truncate" title={selectedDocumentId || ""}>
              {selectedDocumentId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showSnippetOnly && (
            <button
              type="button"
              onClick={() => setDocumentViewMode("full")}
              className="px-3 py-1.5 text-xs font-medium text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors"
            >
              Ver documento completo
            </button>
          )}
          {documentViewMode === "full" && selectedSnippet && (
            <button
              type="button"
              onClick={() => setDocumentViewMode("snippet")}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Solo coincidencia
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto panel-scroll p-5">
        {showSnippetOnly && selectedSnippet ? (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                Coincidencia
              </span>
              {searchQuery && (
                <span>
                  para{" "}
                  <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono text-[11px]">
                    {searchQuery}
                  </code>
                </span>
              )}
            </div>
            <div
              className="snippet-preview snippet-preview--expanded rounded-xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50/80 to-white p-5 shadow-sm text-slate-700 leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: selectedSnippet }}
            />
            <p className="text-xs text-slate-400 text-center">
              Este fragmento es el contexto de tu búsqueda. Usa &quot;Ver documento completo&quot; para
              leer el archivo entero.
            </p>
          </div>
        ) : documentLoading ? (
          <DocumentSkeleton />
        ) : documentError ? (
          <div className="flex items-center justify-center h-full min-h-[200px]">
            <div className="max-w-md text-center px-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-red-500 text-xl">!</span>
              </div>
              <p className="text-slate-800 font-medium mb-1">No se pudo cargar el documento</p>
              <p className="text-sm text-slate-500 break-words">{documentError}</p>
            </div>
          </div>
        ) : documentContent && paragraphs.length > 0 ? (
          <div className="max-w-3xl mx-auto prose prose-slate max-w-none">
            {paragraphs.map((p, idx) => (
              <div
                key={idx}
                ref={idx === targetParagraphIndex ? targetRef : undefined}
                className={cn(
                  "text-[15px] text-slate-700 leading-[1.75] whitespace-pre-wrap mb-4 rounded-xl p-4 border transition-colors",
                  idx === targetParagraphIndex
                    ? "bg-cyan-50/70 border-cyan-200 ring-1 ring-cyan-100"
                    : "bg-slate-50/80 border-slate-200/80"
                )}
                dangerouslySetInnerHTML={{
                  __html: highlightContent(p.text, terms),
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full min-h-[200px] text-slate-400">
            <p className="text-sm">Sin contenido para mostrar</p>
          </div>
        )}
      </div>
    </div>
  );
}
