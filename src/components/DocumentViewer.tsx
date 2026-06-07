import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore } from "../store/uiStore";

const OPERATOR_PATTERN = /^(?:and|or|not)$/i;

/** Extract usable search terms from a raw query string. Mirrors the Rust
 *  parser in `lib.rs::extract_query_terms` so highlighting agrees with the
 *  match offset returned by the backend. */
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

/** Split content into paragraphs on blank lines. Tracks the character
 *  offset of each paragraph's start so we can map a match position back
 *  to a paragraph index. */
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
  return result;
}

/** Find the first case-insensitive occurrence of any term in `content`.
 *  Returns the character offset, or -1 when no term matches. */
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

/** Wrap occurrences of `terms` in `<mark>` tags with per-term colors.
 *  Uses a single alternation regex with terms sorted by length descending
 *  so the regex engine prefers longer matches and never produces nested marks.
 *  Each term gets a cyclic class: mark-1, mark-2, mark-3, mark-4. */
function highlightContent(content: string, terms: string[]): string {
  if (terms.length === 0) return content;
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const pattern = sorted.map(escapeRegex).join("|");
  // Map each term to its class based on original index (not sorted)
  const termToClass = new Map<string, string>();
  terms.forEach((term, idx) => {
    const cls = `mark-${(idx % 4) + 1}`;
    termToClass.set(term.toLowerCase(), cls);
  });
  return content.replace(new RegExp(`(${pattern})`, "gi"), (match) => {
    const cls = termToClass.get(match.toLowerCase()) ?? "mark-1";
    return `<mark class="${cls}">${match}</mark>`;
  });
}

/** Skeleton placeholder for document loading state */
function DocumentSkeleton() {
  const bars = ["w-full", "w-11/12", "w-4/5", "w-full", "w-3/4", "w-5/6", "w-full", "w-2/3"];
  return (
    <div className="p-6 space-y-4">
      {bars.map((width, i) => (
        <div key={i} className={`h-4 bg-slate-200 rounded animate-pulse ${width}`} />
      ))}
    </div>
  );
}

export function DocumentViewer() {
  const selectedDocumentId = useUIStore((s) => s.selectedDocumentId);
  const searchQuery = useUIStore((s) => s.searchQuery);

  const documentContent = useUIStore((s) => s.documentContent);
  const documentLoading = useUIStore((s) => s.documentLoading);
  const documentError = useUIStore((s) => s.documentError);

  const setDocumentContent = useUIStore((s) => s.setDocumentContent);
  const setDocumentMatchOffset = useUIStore((s) => s.setDocumentMatchOffset);
  const setDocumentLoading = useUIStore((s) => s.setDocumentLoading);
  const setDocumentError = useUIStore((s) => s.setDocumentError);
  const resetDocument = useUIStore((s) => s.resetDocument);

  const targetRef = useRef<HTMLDivElement | null>(null);
  const lastLoadedId = useRef<string | null>(null);
  const hasScrolled = useRef<string | null>(null);

  const [hasContent, setHasContent] = useState(false);

  const terms = extractTerms(searchQuery);

  // Lazy-load full document whenever the selected document changes.
  useEffect(() => {
    if (!selectedDocumentId) {
      if (lastLoadedId.current !== null) {
        resetDocument();
        lastLoadedId.current = null;
        hasScrolled.current = null;
        setHasContent(false);
      }
      return;
    }

    // Don't refetch a document we already have.
    if (lastLoadedId.current === selectedDocumentId) return;

    let cancelled = false;
    lastLoadedId.current = selectedDocumentId;
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
    setDocumentContent,
    setDocumentError,
    setDocumentLoading,
    setDocumentMatchOffset,
    resetDocument,
  ]);

  // Split the content into paragraphs and identify the target paragraph
  // that contains the first match (used for scroll-to-match).
  const paragraphs = documentContent ? splitParagraphs(documentContent) : [];
  const matchIndex = documentContent ? findFirstMatchIndex(documentContent, terms) : -1;
  const targetParagraphIndex =
    matchIndex >= 0
      ? paragraphs.findIndex((p) => p.start <= matchIndex && matchIndex < p.start + p.text.length)
      : -1;

  // Scroll to the target paragraph once it's mounted and the document has
  // actually finished loading. Guarded so we only scroll once per document.
  useEffect(() => {
    if (!hasContent) return;
    if (targetParagraphIndex < 0) return;
    if (hasScrolled.current === selectedDocumentId) return;
    const el = targetRef.current;
    if (!el) return;
    hasScrolled.current = selectedDocumentId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [targetParagraphIndex, hasContent, selectedDocumentId]);

  const fileName = selectedDocumentId?.split(/[/\\]/).pop() || "Unknown";
  const fileType = selectedDocumentId?.split(".").pop()?.toUpperCase() || "FILE";

  return (
    <div className="h-full flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Document Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-4">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
              fileType === "PDF"
                ? "bg-red-100 text-red-600"
                : fileType === "TXT"
                  ? "bg-blue-100 text-blue-600"
                  : "bg-slate-200 text-slate-600"
            }`}
          >
            {fileType}
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-800">{fileName}</h2>
            <p
              className="text-xs text-slate-500 truncate max-w-md"
              title={selectedDocumentId || ""}
            >
              {selectedDocumentId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-cyan-100 text-cyan-700 text-xs font-medium">
            {fileType}
          </span>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        {documentLoading ? (
          <DocumentSkeleton />
        ) : documentError ? (
          <div className="flex items-center justify-center h-full">
            <div className="max-w-md text-center">
              <svg
                className="w-12 h-12 text-red-400 mx-auto mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
                />
              </svg>
              <p className="text-slate-700 font-medium mb-1">Failed to load document</p>
              <p className="text-sm text-slate-500 break-words">{documentError}</p>
            </div>
          </div>
        ) : documentContent && paragraphs.length > 0 ? (
          <div className="prose prose-slate max-w-none">
            {paragraphs.map((p, idx) => (
              <div
                key={idx}
                ref={idx === targetParagraphIndex ? targetRef : undefined}
                className={`text-sm text-slate-700 leading-relaxed whitespace-pre-wrap mb-4 rounded-xl p-4 border ${
                  idx === targetParagraphIndex
                    ? "bg-cyan-50/60 border-cyan-200"
                    : "bg-slate-50 border-slate-200"
                }`}
                dangerouslySetInnerHTML={{
                  __html: highlightContent(p.text, terms),
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-slate-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-sm">No content to display</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
