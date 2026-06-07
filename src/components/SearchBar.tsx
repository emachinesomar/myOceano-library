import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore, type SearchResult } from "../store/uiStore";

interface SearchPayload {
  results: SearchResult[];
  hasMore: boolean;
  offset: number;
}

const PAGE_SIZE = 20;
type BooleanOperator = "AND" | "OR" | "NOT";

const HELP_SYNTAX = [
  { syntax: "paz AND justicia", desc: "boolean AND (both terms)" },
  { syntax: "paz OR justicia", desc: "boolean OR (either term)" },
  { syntax: "paz NOT guerra", desc: "boolean NOT (exclude term)" },
  { syntax: '"paz de dios"', desc: "exact phrase (relative position)" },
  { syntax: "paz~2", desc: "fuzzy (edit distance up to 2)" },
  { syntax: "paz*", desc: "wildcard / prefix" },
] as const;

function getFilename(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function getParentPath(path: string): string {
  const filename = getFilename(path);
  return path.slice(0, path.length - filename.length).replace(/[/\\]+$/, "");
}

/** Insert an operator at the end of the query, with proper spacing. */
function applyOperator(query: string, op: BooleanOperator): string {
  const trimmed = query.replace(/\s+$/, "");
  const prefix = trimmed.length > 0 ? " " : "";
  return `${trimmed}${prefix}${op} `;
}

function hasOperator(query: string, op: BooleanOperator): boolean {
  const pattern = new RegExp(`\\b${op}\\b`, "i");
  return pattern.test(query);
}

/** Skeleton placeholder for search results loading state */
function SearchSkeleton() {
  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50">
      <div className="p-3 border-b border-slate-100 bg-slate-50">
        <div className="h-3 bg-slate-200 rounded w-1/3 animate-pulse" />
      </div>
      <ul className="divide-y divide-slate-100">
        {[1, 2, 3].map((i) => (
          <li key={i} className="p-4">
            <div className="h-4 bg-slate-200 rounded w-2/3 mb-2 animate-pulse" />
            <div className="h-3 bg-slate-200 rounded w-1/2 mb-2 animate-pulse" />
            <div className="h-3 bg-slate-200 rounded w-full animate-pulse" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const setSearchResults = useUIStore((s) => s.setSearchResults);
  const searchOffset = useUIStore((s) => s.searchOffset);
  const setSearchOffset = useUIStore((s) => s.setSearchOffset);
  const searchHasMore = useUIStore((s) => s.searchHasMore);
  const setSearchHasMore = useUIStore((s) => s.setSearchHasMore);
  const setSearchError = useUIStore((s) => s.setSearchError);
  const searchError = useUIStore((s) => s.searchError);

  // Initial / query-change search (debounced, offset = 0)
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearchResults([]);
      setSearchOffset(0);
      setSearchHasMore(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchQuery(query);
      setSearching(true);
      setSearchError(null);
      try {
        const folderPath = localStorage.getItem("currentFolder") || "";
        if (folderPath) {
          const raw = await invoke<string>("full_text_search", {
            query,
            folderPath,
            offset: 0,
          });
          const parsed: SearchPayload = JSON.parse(raw || "{}");
          const list = parsed.results ?? [];
          setResults(list);
          setSearchResults(list);
          setSearchHasMore(parsed.hasMore ?? false);
          setSearchOffset(0);
          setSearchError(null);
          if (list.length > 0) {
            setSearching(false);
            return;
          }
        }

        // Fallback: semantic search via Python sidecar
        const semResult = await invoke<string>("search", { query });
        console.log("Semantic search result:", semResult);
      } catch (error) {
        console.error("Search error:", error);
        setSearchError(error instanceof Error ? error.message : String(error));
      }
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, setSearchQuery, setSearchResults, setSearchOffset, setSearchHasMore, setSearchError]);

  // Dismiss help popover on outside click
  useEffect(() => {
    if (!showHelp) return;
    const handler = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showHelp]);

  const handleOperator = (op: BooleanOperator) => {
    const newQuery = applyOperator(query, op);
    setQuery(newQuery);
    setTimeout(() => {
      inputRef.current?.focus();
      const pos = newQuery.length;
      inputRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleLoadMore = async () => {
    if (searching) return;
    const nextOffset = searchOffset + PAGE_SIZE;
    setSearching(true);
    try {
      const folderPath = localStorage.getItem("currentFolder") || "";
      const raw = await invoke<string>("full_text_search", {
        query,
        folderPath,
        offset: nextOffset,
      });
      const parsed: SearchPayload = JSON.parse(raw || "{}");
      const list = parsed.results ?? [];
      const combined = [...results, ...list];
      setResults(combined);
      setSearchResults(combined);
      setSearchHasMore(parsed.hasMore ?? false);
      setSearchOffset(nextOffset);
      setSearchError(null);
    } catch (error) {
      console.error("Load more error:", error);
      setSearchError(error instanceof Error ? error.message : String(error));
    }
    setSearching(false);
  };

  const andActive = hasOperator(query, "AND");
  const orActive = hasOperator(query, "OR");
  const notActive = hasOperator(query, "NOT");

  return (
    <div className="relative">
      {/* Search input row */}
      <div className="flex items-center bg-slate-100 rounded-xl border border-slate-200 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all">
        <svg
          className="w-5 h-5 text-slate-400 ml-4 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents..."
          className="flex-1 min-w-0 bg-transparent px-3 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
        />

        {/* Boolean operator buttons (Task 1.1 + 1.4) */}
        <div className="flex items-center gap-1 pr-2 border-l border-slate-200 pl-2">
          <button
            type="button"
            onClick={() => handleOperator("AND")}
            aria-label="Insert AND operator"
            aria-pressed={andActive}
            className={
              andActive
                ? "px-2 py-1 text-xs font-bold rounded-md bg-cyan-500 text-white border border-cyan-500"
                : "px-2 py-1 text-xs font-bold rounded-md bg-white text-cyan-700 border border-cyan-300 hover:bg-cyan-50 transition-colors"
            }
          >
            AND
          </button>
          <button
            type="button"
            onClick={() => handleOperator("OR")}
            aria-label="Insert OR operator"
            aria-pressed={orActive}
            className={
              orActive
                ? "px-2 py-1 text-xs font-bold rounded-md bg-cyan-500 text-white border border-cyan-500"
                : "px-2 py-1 text-xs font-bold rounded-md bg-white text-cyan-700 border border-cyan-300 hover:bg-cyan-50 transition-colors"
            }
          >
            OR
          </button>
          <button
            type="button"
            onClick={() => handleOperator("NOT")}
            aria-label="Insert NOT operator"
            aria-pressed={notActive}
            className={
              notActive
                ? "px-2 py-1 text-xs font-bold rounded-md bg-cyan-500 text-white border border-cyan-500"
                : "px-2 py-1 text-xs font-bold rounded-md bg-white text-cyan-700 border border-cyan-300 hover:bg-cyan-50 transition-colors"
            }
          >
            NOT
          </button>
        </div>

        {/* Help button (Task 1.2) */}
        <div className="relative" ref={helpRef}>
          <button
            type="button"
            onClick={() => setShowHelp((prev) => !prev)}
            aria-label="Search syntax help"
            aria-expanded={showHelp}
            className="ml-1 mr-2 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
          >
            ?
          </button>

          {showHelp && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-[60] overflow-hidden">
              <div className="p-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Search syntax
                </p>
              </div>
              <ul className="p-2 text-sm">
                {HELP_SYNTAX.map((item) => (
                  <li
                    key={item.syntax}
                    className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-slate-50"
                  >
                    <code className="font-mono text-xs text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                      {item.syntax}
                    </code>
                    <span className="text-xs text-slate-500 leading-5">{item.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {searching && (
          <div className="pr-4">
            <svg className="animate-spin w-4 h-4 text-cyan-500" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Inline error message */}
      {searchError && (
        <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>{searchError}</span>
          <button
            type="button"
            onClick={() => setSearchError(null)}
            className="ml-2 text-red-400 hover:text-red-600"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Search Results Dropdown */}
      {searching && results.length === 0 && query.trim() && <SearchSkeleton />}
      {results.length > 0 && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50 max-h-96 overflow-y-auto">
          <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">
              {results.length} result{results.length !== 1 ? "s" : ""} found
            </p>
            {searchOffset > 0 && (
              <p className="text-xs text-slate-400">showing from offset {searchOffset}</p>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {results.map((result, idx) => (
              <li key={`${result.path}-${idx}`}>
                <button
                  className="w-full text-left p-4 hover:bg-slate-50 transition-colors"
                  onClick={() => {
                    useUIStore.getState().setSelectedDocumentId(result.path);
                    useUIStore.getState().setSelectedSnippet(result.snippet);
                    setResults([]);
                    setSearchOffset(0);
                    setSearchHasMore(false);
                  }}
                >
                  <p
                    className="text-sm font-semibold text-slate-800 mb-0.5 truncate"
                    title={result.path}
                  >
                    {getFilename(result.path)}
                  </p>
                  {getParentPath(result.path) && (
                    <p className="text-xs text-slate-400 mb-1 truncate">
                      {getParentPath(result.path)}
                    </p>
                  )}
                  <p
                    className="text-xs text-slate-500 line-clamp-2 mb-1"
                    dangerouslySetInnerHTML={{ __html: result.snippet }}
                  />
                  <p className="text-xs text-cyan-600 font-medium">
                    Score: {result.score.toFixed(2)}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {/* Load more (Task 1.3) */}
          {searchHasMore && (
            <div className="p-3 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={searching}
                className="w-full px-3 py-2 text-sm font-medium text-cyan-700 bg-white border border-cyan-200 rounded-lg hover:bg-cyan-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {searching ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Loading more...
                  </>
                ) : (
                  <>Ver más resultados</>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
