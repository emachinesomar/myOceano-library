import { useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore, type SearchResult } from "../store/uiStore";
import { Sidebar } from "./Sidebar";
import { SearchBar } from "./SearchBar";
import { ResultTree } from "./ResultTree";
import { SettingsPanel } from "./SettingsPanel";

interface LayoutProps {
  children: ReactNode;
}

const PAGE_SIZE = 20;

interface SearchPayload {
  results: SearchResult[];
  hasMore: boolean;
  offset: number;
}

export function Layout({ children }: LayoutProps) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const searchResults = useUIStore((s) => s.searchResults);
  const selectedDocumentId = useUIStore((s) => s.selectedDocumentId);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const searchError = useUIStore((s) => s.searchError);
  const searchHasMore = useUIStore((s) => s.searchHasMore);
  const searchOffset = useUIStore((s) => s.searchOffset);
  const setSearchResults = useUIStore((s) => s.setSearchResults);
  const setSearchHasMore = useUIStore((s) => s.setSearchHasMore);
  const setSearchOffset = useUIStore((s) => s.setSearchOffset);
  const setSearchError = useUIStore((s) => s.setSearchError);
  const indexedFileCount = useUIStore((s) => s.indexedFileCount);
  const selectSearchResult = useUIStore((s) => s.selectSearchResult);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const handleTreeSelect = (result: SearchResult) => {
    selectSearchResult(result, searchQuery);
  };

  const handleLoadMore = async () => {
    if (loadingMore || !searchQuery.trim()) return;
    setLoadingMore(true);
    try {
      const folderPath = localStorage.getItem("currentFolder") || "";
      const nextOffset = searchOffset + PAGE_SIZE;
      const raw = await invoke<string>("full_text_search", {
        query: searchQuery,
        folderPath,
        offset: nextOffset,
      });
      const parsed: SearchPayload = JSON.parse(raw || "{}");
      const list = parsed.results ?? [];
      setSearchResults([...searchResults, ...list]);
      setSearchHasMore(parsed.hasMore ?? false);
      setSearchOffset(nextOffset);
      setSearchError(null);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : String(error));
    }
    setLoadingMore(false);
  };

  const statusLabel =
    searchResults.length > 0
      ? `${searchResults.length} resultado${searchResults.length !== 1 ? "s" : ""}`
      : indexedFileCount > 0
        ? `${indexedFileCount} docs indexados`
        : "Listo";

  return (
    <div className="flex flex-col h-screen bg-slate-100 text-slate-900">
      <header className="h-14 flex items-center gap-2 px-3 bg-white/90 backdrop-blur border-b border-slate-200/80 flex-shrink-0 z-20">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
          aria-label={sidebarOpen ? "Ocultar panel lateral" : "Mostrar panel lateral"}
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-xs text-white shadow-sm">
            O
          </div>
          <span className="font-semibold text-sm text-slate-800 hidden sm:inline tracking-tight">
            Ocean Library
          </span>
        </div>

        <div className="flex-1 max-w-3xl mx-2 min-w-0">
          <SearchBar />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium text-xs border border-slate-200/80">
            {statusLabel}
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Ajustes"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {sidebarOpen && (
          <aside className="w-72 bg-slate-900 text-white flex flex-col shrink-0 border-r border-slate-800 shadow-xl z-10">
            <Sidebar />
          </aside>
        )}

        <div className="w-80 xl:w-96 shrink-0 border-r border-slate-200/80 bg-white flex flex-col shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 to-white">
            <p className="text-xs font-semibold text-slate-700 tracking-tight">Resultados</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {searchResults.length > 0
                ? "Agrupados por tradición y libro"
                : "Busca para explorar tu biblioteca"}
            </p>
          </div>
          <div className="flex-1 min-h-0">
            <ResultTree
              results={searchResults}
              onSelect={handleTreeSelect}
              selectedPath={selectedDocumentId}
            />
          </div>
          {searchHasMore && searchResults.length > 0 && (
            <div className="p-3 border-t border-slate-200/80 bg-slate-50">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full px-3 py-2 text-xs font-medium text-cyan-800 bg-white border border-cyan-200 rounded-lg hover:bg-cyan-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loadingMore ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Cargando…
                  </>
                ) : (
                  "Cargar más resultados"
                )}
              </button>
            </div>
          )}
        </div>

        <main className="flex-1 min-w-0 overflow-auto p-3 sm:p-4 bg-slate-100/80">
          {searchResults.length === 0 && !selectedDocumentId && searchError ? (
            <div className="h-full flex flex-col items-center justify-center text-red-600">
              <div className="max-w-md text-center bg-white rounded-2xl border border-red-100 p-8 shadow-sm">
                <p className="text-lg font-semibold mb-2">Error de búsqueda</p>
                <p className="text-sm text-red-500/90">{searchError}</p>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
