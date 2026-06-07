import { useState } from "react";
import { useUIStore, type SearchResult } from "../store/uiStore";
import { cn } from "../lib/utils";

interface ResultTreeProps {
  results: SearchResult[];
  onSelect: (result: SearchResult) => void;
  selectedPath?: string | null;
}

interface ChapterNode {
  chapter: string;
  matches: SearchResult[];
}

interface BookNode {
  book: string;
  chapters: ChapterNode[];
}

interface ReligionNode {
  religion: string;
  books: BookNode[];
}

/** Strip HTML tags from snippet for plain-text preview. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/** Truncate text to maxLen, adding ellipsis if needed. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + "\u2026";
}

/** Parse chapter string to number for sorting; fallback to NaN for string sort. */
function chapterNumeric(ch: string): number {
  const n = parseInt(ch, 10);
  return Number.isNaN(n) ? -1 : n;
}

/** Build the hierarchical tree from flat results. */
function buildTree(results: SearchResult[]): ReligionNode[] {
  const religionMap = new Map<string, Map<string, Map<string, SearchResult[]>>>();

  for (const r of results) {
    const rel = r.religion || "Unknown";
    const book = r.book || "Unknown";
    const ch = r.chapter || "—";

    if (!religionMap.has(rel)) religionMap.set(rel, new Map());
    const bookMap = religionMap.get(rel)!;
    if (!bookMap.has(book)) bookMap.set(book, new Map());
    const chMap = bookMap.get(book)!;
    if (!chMap.has(ch)) chMap.set(ch, []);
    chMap.get(ch)!.push(r);
  }

  const tree: ReligionNode[] = [];
  const sortedReligions = [...religionMap.keys()].sort((a, b) => a.localeCompare(b));

  for (const rel of sortedReligions) {
    const bookMap = religionMap.get(rel)!;
    const books: BookNode[] = [];
    const sortedBooks = [...bookMap.keys()].sort((a, b) => a.localeCompare(b));

    for (const book of sortedBooks) {
      const chMap = bookMap.get(book)!;
      const chapters: ChapterNode[] = [];
      const sortedChapters = [...chMap.keys()].sort((a, b) => {
        const na = chapterNumeric(a);
        const nb = chapterNumeric(b);
        if (na >= 0 && nb >= 0) return na - nb;
        if (na >= 0) return -1;
        if (nb >= 0) return 1;
        return a.localeCompare(b);
      });

      for (const ch of sortedChapters) {
        const matches = chMap.get(ch)!.sort((a, b) => b.score - a.score);
        chapters.push({ chapter: ch, matches });
      }

      books.push({ book, chapters });
    }

    tree.push({ religion: rel, books });
  }

  return tree;
}

export function ResultTree({ results, onSelect, selectedPath }: ResultTreeProps) {
  // Track expanded state per node key
  const [expandedReligions, setExpandedReligions] = useState<Set<string>>(() => new Set());
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(() => new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(() => new Set());
  const searchError = useUIStore((s) => s.searchError);

  const tree = buildTree(results);

  // Auto-expand on first render: all religions + books, chapters only if ≤5
  const [initialized, setInitialized] = useState(false);
  if (!initialized && tree.length > 0) {
    const rels = new Set<string>();
    const books = new Set<string>();
    const chaps = new Set<string>();
    for (const r of tree) {
      rels.add(r.religion);
      for (const b of r.books) {
        books.add(`${r.religion}::${b.book}`);
        if (b.chapters.length <= 5) {
          for (const c of b.chapters) {
            chaps.add(`${r.religion}::${b.book}::${c.chapter}`);
          }
        }
      }
    }
    // Use queueMicrotask to avoid setState-during-render
    queueMicrotask(() => {
      setExpandedReligions(rels);
      setExpandedBooks(books);
      setExpandedChapters(chaps);
      setInitialized(true);
    });
  }

  const toggleReligion = (rel: string) => {
    setExpandedReligions((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) next.delete(rel);
      else next.add(rel);
      return next;
    });
  };

  const toggleBook = (key: string) => {
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleChapter = (key: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (results.length === 0) {
    if (searchError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-red-500 px-4">
          <svg
            className="w-10 h-10 mb-3 text-red-400"
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
          <p className="text-sm text-center font-medium">Search error</p>
          <p className="text-xs text-center mt-1 text-red-400">{searchError}</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 px-4">
        <svg
          className="w-10 h-10 mb-3 text-slate-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <p className="text-sm text-center">Search to see results grouped by religion</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full text-sm">
      {tree.map((relNode) => {
        const relExpanded = expandedReligions.has(relNode.religion);
        return (
          <div key={relNode.religion}>
            {/* Religion node */}
            <button
              onClick={() => toggleReligion(relNode.religion)}
              className="w-full flex items-center gap-2 px-3 py-2 font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
            >
              <svg
                className={cn(
                  "w-3 h-3 text-slate-400 transition-transform",
                  relExpanded && "rotate-90"
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <span>{relNode.religion}</span>
              <span className="ml-auto text-xs text-slate-400 font-normal">
                {relNode.books.reduce(
                  (acc, b) => acc + b.chapters.reduce((a2, c) => a2 + c.matches.length, 0),
                  0
                )}
              </span>
            </button>

            {relExpanded && (
              <div className="ml-3">
                {relNode.books.map((bookNode) => {
                  const bookKey = `${relNode.religion}::${bookNode.book}`;
                  const bookExpanded = expandedBooks.has(bookKey);
                  return (
                    <div key={bookKey}>
                      {/* Book node */}
                      <button
                        onClick={() => toggleBook(bookKey)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <svg
                          className={cn(
                            "w-3 h-3 text-slate-400 transition-transform",
                            bookExpanded && "rotate-90"
                          )}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        <span className="font-medium">{bookNode.book}</span>
                        <span className="ml-auto text-xs text-slate-400 font-normal">
                          {bookNode.chapters.reduce((a, c) => a + c.matches.length, 0)}
                        </span>
                      </button>

                      {bookExpanded && (
                        <div className="ml-3">
                          {bookNode.chapters.map((chNode) => {
                            const chKey = `${relNode.religion}::${bookNode.book}::${chNode.chapter}`;
                            const chExpanded = expandedChapters.has(chKey);
                            return (
                              <div key={chKey}>
                                {/* Chapter node */}
                                <button
                                  onClick={() => toggleChapter(chKey)}
                                  className="w-full flex items-center gap-2 px-3 py-1 text-slate-600 hover:bg-slate-100 transition-colors"
                                >
                                  <svg
                                    className={cn(
                                      "w-3 h-3 text-slate-400 transition-transform",
                                      chExpanded && "rotate-90"
                                    )}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M9 5l7 7-7 7"
                                    />
                                  </svg>
                                  <span className="text-xs font-medium">Ch. {chNode.chapter}</span>
                                  <span className="ml-auto text-xs text-slate-400">
                                    {chNode.matches.length}
                                  </span>
                                </button>

                                {chExpanded && (
                                  <div className="ml-3 mb-1">
                                    {chNode.matches.map((match, idx) => {
                                      const filename =
                                        match.path.split(/[/\\]/).pop() || match.path;
                                      const isSelected = selectedPath === match.path;
                                      return (
                                        <button
                                          key={`${match.path}-${idx}`}
                                          onClick={() => onSelect(match)}
                                          className={cn(
                                            "w-full text-left px-3 py-2 rounded-lg transition-colors block",
                                            isSelected
                                              ? "bg-cyan-50 border border-cyan-200"
                                              : "hover:bg-slate-50 border border-transparent"
                                          )}
                                        >
                                          <div className="flex items-center gap-2 mb-0.5">
                                            <span className="font-medium text-slate-800 text-xs truncate">
                                              {filename}
                                            </span>
                                            <span className="ml-auto flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-cyan-100 text-cyan-700">
                                              {match.score.toFixed(2)}
                                            </span>
                                          </div>
                                          {match.verse && (
                                            <p className="text-[10px] text-slate-400 mb-0.5">
                                              v. {match.verse}
                                            </p>
                                          )}
                                          <p className="text-[11px] text-slate-500 line-clamp-2 leading-snug">
                                            {truncate(stripHtml(match.snippet), 80)}
                                          </p>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
