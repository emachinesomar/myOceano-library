import { useState, type ReactNode } from "react";
import { useUIStore, type SearchResult } from "../store/uiStore";
import { Sidebar } from "./Sidebar";
import { SearchBar } from "./SearchBar";
import { ResultTree } from "./ResultTree";
import { SettingsPanel } from "./SettingsPanel";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const searchResults = useUIStore((s) => s.searchResults);
  const selectedDocumentId = useUIStore((s) => s.selectedDocumentId);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const searchError = useUIStore((s) => s.searchError);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleTreeSelect = (result: SearchResult) => {
    useUIStore.getState().setSelectedDocumentId(result.path);
    useUIStore.getState().setSearchQuery(searchQuery);
    useUIStore.getState().setSelectedSnippet(result.snippet);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top Bar */}
      <header className="h-16 flex items-center gap-3 px-4 bg-white border-b border-slate-200 shadow-sm flex-shrink-0 z-10">
        {/* Sidebar toggle + folder picker */}
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <svg
            className="w-5 h-5 text-slate-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-xs text-white">
            O
          </div>
          <span className="font-semibold text-sm text-slate-700 hidden sm:inline">
            Ocean Library
          </span>
        </div>

        {/* SearchBar */}
        <div className="flex-1 max-w-2xl mx-4">
          <SearchBar />
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 font-medium text-xs">
            {searchResults.length > 0 ? `${searchResults.length} results` : "Ready"}
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Open settings"
          >
            <svg
              className="w-5 h-5 text-slate-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Body: sidebar overlay + split panel */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar overlay (dark, collapsible) */}
        {sidebarOpen && (
          <aside className="w-72 bg-slate-900 text-white flex flex-col flex-shrink-0 border-r border-slate-700">
            <Sidebar />
          </aside>
        )}

        {/* Left panel: ResultTree */}
        <div className="w-80 flex-shrink-0 border-r border-slate-200 bg-white overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Results</p>
          </div>
          <div className="flex-1 min-h-0">
            <ResultTree
              results={searchResults}
              onSelect={handleTreeSelect}
              selectedPath={selectedDocumentId}
            />
          </div>
        </div>

        {/* Right panel: children (DocumentViewer) */}
        <main className="flex-1 min-w-0 overflow-auto p-4">
          {searchResults.length === 0 && !selectedDocumentId && searchError ? (
            <div className="flex flex-col items-center justify-center h-full text-red-500">
              <svg
                className="w-12 h-12 mb-3 text-red-400"
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
              <p className="text-lg font-medium mb-1">Search error</p>
              <p className="text-sm text-red-400 max-w-md text-center">
                {searchError}
              </p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
      {settingsOpen && (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
