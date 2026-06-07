import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore, type SearchResult } from "../store/uiStore";
import { cn } from "../lib/utils";

interface SearchPayload {
  results: SearchResult[];
  hasMore: boolean;
  offset: number;
}

type BooleanOperator = "AND" | "OR" | "NOT";

const HELP_SYNTAX = [
  { syntax: "paz AND justicia", desc: "ambos términos en el mismo documento" },
  { syntax: "paz OR justicia", desc: "cualquiera de los dos términos" },
  { syntax: "paz NOT guerra", desc: "excluir un término" },
  { syntax: '"paz de dios"', desc: "frase exacta" },
  { syntax: "paz~2", desc: "búsqueda difusa (hasta 2 errores)" },
  { syntax: "paz*", desc: "prefijo / comodín" },
] as const;

/** Strip trailing boolean operators that would cause a Tantivy parse error. */
function cleanQuery(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s+(AND|OR|NOT)\s*$/i, "")
    .trim();
}

/** Convert raw error messages to user-friendly text. */
function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("syntax error")) return "Sintaxis inválida. Revisa los operadores.";
  if (lower.includes("folder does not exist") || lower.includes("no folder"))
    return "Escanea una carpeta antes de buscar.";
  if (lower.includes("field not found")) return "Índice no listo. Escanea una carpeta primero.";
  if (lower.includes("connection refused") || lower.includes("embed_chunks"))
    return "Búsqueda semántica no disponible.";
  if (lower.includes("timed out")) return "Búsqueda muy lenta. Intenta con menos términos.";
  return raw.length > 100 ? raw.slice(0, 97) + "..." : raw;
}

function applyOperator(query: string, op: BooleanOperator): string {
  const trimmed = query.replace(/\s+$/, "");
  const prefix = trimmed.length > 0 ? " " : "";
  return `${trimmed}${prefix}${op} `;
}

function hasOperator(query: string, op: BooleanOperator): boolean {
  return new RegExp(`\\b${op}\\b`, "i").test(query);
}

function SearchSkeleton() {
  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50">
      <div className="p-3 border-b border-slate-100 bg-slate-50">
        <div className="h-3 bg-slate-200 rounded w-1/3 animate-pulse" />
      </div>
      <ul className="divide-y divide-slate-100">
        {[1, 2, 3].map((i) => (
          <li key={i} className="p-4 space-y-2">
            <div className="h-4 bg-slate-200 rounded w-2/3 animate-pulse" />
            <div className="h-3 bg-slate-200 rounded w-full animate-pulse" />
            <div className="h-3 bg-slate-200 rounded w-4/5 animate-pulse" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function OperatorButton({
  op,
  active,
  onClick,
}: {
  op: BooleanOperator;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Insertar operador ${op}`}
      aria-pressed={active}
      className={cn(
        "px-2 py-1 text-[11px] font-bold rounded-md border transition-all",
        active
          ? "bg-cyan-600 text-white border-cyan-600 shadow-sm"
          : "bg-white text-cyan-800 border-cyan-200/80 hover:bg-cyan-50"
      )}
    >
      {op}
    </button>
  );
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [noFolder, setNoFolder] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const setSearchResults = useUIStore((s) => s.setSearchResults);
  const setSearchOffset = useUIStore((s) => s.setSearchOffset);
  const setSearchHasMore = useUIStore((s) => s.setSearchHasMore);
  const setSearchError = useUIStore((s) => s.setSearchError);
  const searchError = useUIStore((s) => s.searchError);
  const searchResults = useUIStore((s) => s.searchResults);

  // Ctrl+K focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Actual search logic — extracted so both debounce and search button can call it
  const executeSearch = async (q: string) => {
    const cleaned = cleanQuery(q);
    if (!cleaned) {
      setSearchResults([]);
      setSearchOffset(0);
      setSearchHasMore(false);
      setNoFolder(false);
      return;
    }

    setSearchQuery(cleaned);
    setSearching(true);
    setSearchError(null);
    setNoFolder(false);

    try {
      const folderPath = localStorage.getItem("currentFolder") || "";
      if (!folderPath) {
        setNoFolder(true);
        setSearchResults([]);
        setSearching(false);
        return;
      }

      const raw = await invoke<string>("full_text_search", {
        query: cleaned,
        folderPath,
        offset: 0,
      });
      const parsed: SearchPayload = JSON.parse(raw || "{}");
      const list = parsed.results ?? [];
      setSearchResults(list);
      setSearchHasMore(parsed.hasMore ?? false);
      setSearchOffset(0);
      setSearchError(null);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : String(error));
    }
    setSearching(false);
  };

  // Debounced search on query change
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchOffset(0);
      setSearchHasMore(false);
      setNoFolder(false);
      setSearchError(null);
      return;
    }

    const timer = setTimeout(() => executeSearch(query), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Click outside to close help
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

  const handleSearchClick = () => {
    executeSearch(query);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executeSearch(query);
    }
  };

  const handleClear = () => {
    setQuery("");
    setSearchError(null);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center bg-white rounded-xl border border-slate-200 shadow-sm focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/15 transition-all">
        {/* Search icon — clickable, triggers search */}
        <button
          type="button"
          onClick={handleSearchClick}
          aria-label="Buscar"
          className="p-2 ml-2 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors shrink-0"
        >
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar en tus documentos…"
          className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
        />

        {query && !searching && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 mr-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100"
            aria-label="Limpiar búsqueda"
          >
            ×
          </button>
        )}

        <div className="hidden md:flex items-center gap-1 px-2 border-l border-slate-100">
          <OperatorButton op="AND" active={hasOperator(query, "AND")} onClick={() => handleOperator("AND")} />
          <OperatorButton op="OR" active={hasOperator(query, "OR")} onClick={() => handleOperator("OR")} />
          <OperatorButton op="NOT" active={hasOperator(query, "NOT")} onClick={() => handleOperator("NOT")} />
        </div>

        <div className="relative shrink-0" ref={helpRef}>
          <button
            type="button"
            onClick={() => setShowHelp((prev) => !prev)}
            aria-label="Ayuda de sintaxis"
            aria-expanded={showHelp}
            className="mx-2 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-cyan-700 hover:bg-cyan-50 transition-colors text-sm font-medium"
          >
            ?
          </button>

          {showHelp && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-[60] overflow-hidden">
              <div className="p-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-700">Sintaxis de búsqueda</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Ctrl+K para enfocar la barra</p>
              </div>
              <ul className="p-2">
                {HELP_SYNTAX.map((item) => (
                  <li
                    key={item.syntax}
                    className="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-slate-50"
                  >
                    <code className="font-mono text-[11px] text-cyan-800 bg-cyan-50 px-1.5 py-0.5 rounded shrink-0">
                      {item.syntax}
                    </code>
                    <span className="text-xs text-slate-500 leading-snug">{item.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <kbd className="hidden lg:inline-flex mr-3 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-100 border border-slate-200 rounded">
          ⌘K
        </kbd>

        {searching && (
          <div className="pr-3">
            <svg className="animate-spin w-4 h-4 text-cyan-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>

      {noFolder && (
        <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Escanea una carpeta desde el panel lateral antes de buscar.
        </p>
      )}

      {searchError && (
        <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm flex items-center justify-between gap-2">
          <span className="text-xs">{friendlyError(searchError)}</span>
          <button
            type="button"
            onClick={() => setSearchError(null)}
            className="text-amber-400 hover:text-amber-600 shrink-0"
            aria-label="Cerrar error"
          >
            ×
          </button>
        </div>
      )}

      {searching && searchResults.length === 0 && query.trim() && !noFolder && <SearchSkeleton />}
    </div>
  );
}
