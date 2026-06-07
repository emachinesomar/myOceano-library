import { useEffect, useState } from "react";
import { useUIStore, type SearchResult } from "../store/uiStore";
import { getFilename } from "../lib/pathUtils";
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

function chapterNumeric(ch: string): number {
  const n = parseInt(ch, 10);
  return Number.isNaN(n) ? -1 : n;
}

function buildTree(results: SearchResult[]): ReligionNode[] {
  const religionMap = new Map<string, Map<string, Map<string, SearchResult[]>>>();

  for (const r of results) {
    const rel = r.religion || "Sin clasificar";
    const book = r.book || "Sin título";
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

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={cn("w-3.5 h-3.5 text-slate-400 transition-transform duration-200", expanded && "rotate-90")}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function ResultTree({ results, onSelect, selectedPath }: ResultTreeProps) {
  const [expandedReligions, setExpandedReligions] = useState<Set<string>>(() => new Set());
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(() => new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(() => new Set());
  const searchError = useUIStore((s) => s.searchError);
  const searchQuery = useUIStore((s) => s.searchQuery);

  const tree = buildTree(results);
  const resultsKey = results.map((r) => `${r.path}:${r.score}`).join("|");

  useEffect(() => {
    if (tree.length === 0) {
      setExpandedReligions(new Set());
      setExpandedBooks(new Set());
      setExpandedChapters(new Set());
      return;
    }

    const rels = new Set<string>();
    const books = new Set<string>();
    const chaps = new Set<string>();

    for (const r of tree) {
      rels.add(r.religion);
      for (const b of r.books) {
        books.add(`${r.religion}::${b.book}`);
        for (const c of b.chapters) {
          chaps.add(`${r.religion}::${b.book}::${c.chapter}`);
        }
      }
    }

    setExpandedReligions(rels);
    setExpandedBooks(books);
    setExpandedChapters(chaps);
  }, [resultsKey]);

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
        <div className="flex flex-col items-center justify-center h-full text-red-600 px-6 py-8">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
            <span className="text-red-500 text-lg font-bold">!</span>
          </div>
          <p className="text-sm font-medium text-center">Error de búsqueda</p>
          <p className="text-xs text-center mt-2 text-red-500/90 leading-relaxed">{searchError}</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 px-6 py-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-500 mb-1">Sin resultados aún</p>
        <p className="text-xs text-slate-400 leading-relaxed max-w-[220px]">
          Escribe en la barra superior para ver coincidencias agrupadas por tradición y libro
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full text-sm panel-scroll">
      {searchQuery && (
        <div className="px-3 py-2 bg-cyan-50/60 border-b border-cyan-100/80">
          <p className="text-[10px] uppercase tracking-wider text-cyan-700/70 font-semibold mb-0.5">
            Consulta activa
          </p>
          <p className="text-xs text-cyan-900 font-mono truncate" title={searchQuery}>
            {searchQuery}
          </p>
        </div>
      )}

      {tree.map((relNode) => {
        const relExpanded = expandedReligions.has(relNode.religion);
        const matchCount = relNode.books.reduce(
          (acc, b) => acc + b.chapters.reduce((a2, c) => a2 + c.matches.length, 0),
          0
        );

        return (
          <div key={relNode.religion} className="border-b border-slate-100 last:border-0">
            <button
              onClick={() => toggleReligion(relNode.religion)}
              className="w-full flex items-center gap-2 px-3 py-2.5 font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <Chevron expanded={relExpanded} />
              <span className="truncate">{relNode.religion}</span>
              <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                {matchCount}
              </span>
            </button>

            {relExpanded && (
              <div className="ml-2 border-l border-slate-200/80">
                {relNode.books.map((bookNode) => {
                  const bookKey = `${relNode.religion}::${bookNode.book}`;
                  const bookExpanded = expandedBooks.has(bookKey);
                  const bookMatches = bookNode.chapters.reduce((a, c) => a + c.matches.length, 0);

                  return (
                    <div key={bookKey}>
                      <button
                        onClick={() => toggleBook(bookKey)}
                        className="w-full flex items-center gap-2 pl-3 pr-3 py-2 text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Chevron expanded={bookExpanded} />
                        <span className="font-medium truncate text-[13px]">{bookNode.book}</span>
                        <span className="ml-auto text-[10px] text-slate-400">{bookMatches}</span>
                      </button>

                      {bookExpanded && (
                        <div className="ml-2 border-l border-slate-100">
                          {bookNode.chapters.map((chNode) => {
                            const chKey = `${relNode.religion}::${bookNode.book}::${chNode.chapter}`;
                            const chExpanded = expandedChapters.has(chKey);

                            return (
                              <div key={chKey}>
                                <button
                                  onClick={() => toggleChapter(chKey)}
                                  className="w-full flex items-center gap-2 pl-3 pr-3 py-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
                                >
                                  <Chevron expanded={chExpanded} />
                                  <span className="text-xs font-medium">
                                    {chNode.chapter === "—" ? "Sin capítulo" : `Cap. ${chNode.chapter}`}
                                  </span>
                                  <span className="ml-auto text-[10px] text-slate-400">
                                    {chNode.matches.length}
                                  </span>
                                </button>

                                {chExpanded && (
                                  <div className="pl-2 pr-2 pb-2 space-y-1.5">
                                    {chNode.matches.map((match, idx) => {
                                      const filename = getFilename(match.path);
                                      const isSelected = selectedPath === match.path;

                                      return (
                                        <button
                                          key={`${match.path}-${idx}`}
                                          onClick={() => onSelect(match)}
                                          className={cn(
                                            "w-full text-left rounded-xl p-3 transition-all border",
                                            isSelected
                                              ? "bg-cyan-50 border-cyan-300 shadow-sm ring-1 ring-cyan-100"
                                              : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                                          )}
                                        >
                                          <div className="flex items-start gap-2 mb-2">
                                            <span className="font-medium text-slate-800 text-xs truncate flex-1">
                                              {filename}
                                            </span>
                                            <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-slate-100 text-slate-600">
                                              {match.score.toFixed(1)}
                                            </span>
                                          </div>
                                          {match.verse && (
                                            <p className="text-[10px] text-slate-400 mb-1.5">v. {match.verse}</p>
                                          )}
                                          {/*
                                            Accessibility note: dangerouslySetInnerHTML is intentional here.
                                            Snippets come from Tantivy's indexed content (not user-authored HTML).
                                            The search query is never injected inside the HTML — Tantivy wraps
                                            matched terms in <mark> tags during snippet generation.
                                          */}
                                          <div
                                            className="snippet-preview snippet-preview--compact line-clamp-6 snippet-fade relative"
                                            dangerouslySetInnerHTML={{ __html: match.snippet }}
                                          />
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
