import { create } from "zustand";

export interface SearchResult {
  path: string;
  snippet: string;
  score: number;
  religion: string;
  book: string;
  chapter: string;
  verse: string;
}

export type DocumentViewMode = "snippet" | "full";

interface UIStore {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchOffset: number;
  setSearchOffset: (offset: number) => void;
  searchHasMore: boolean;
  setSearchHasMore: (hasMore: boolean) => void;
  searchError: string | null;
  setSearchError: (error: string | null) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  selectedDocumentId: string | null;
  setSelectedDocumentId: (id: string | null) => void;
  selectedSnippet: string | null;
  setSelectedSnippet: (snippet: string | null) => void;
  documentViewMode: DocumentViewMode;
  setDocumentViewMode: (mode: DocumentViewMode) => void;
  selectSearchResult: (result: SearchResult, query: string) => void;
  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;
  documentContent: string | null;
  documentMatchOffset: number | null;
  documentLoading: boolean;
  documentError: string | null;
  setDocumentContent: (content: string | null) => void;
  setDocumentMatchOffset: (offset: number | null) => void;
  setDocumentLoading: (loading: boolean) => void;
  setDocumentError: (error: string | null) => void;
  resetDocument: () => void;
  scanMessage: string | null;
  scanError: string | null;
  indexedFileCount: number;
  setScanMessage: (message: string | null) => void;
  setScanError: (error: string | null) => void;
  setIndexedFileCount: (count: number) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),
  searchOffset: 0,
  setSearchOffset: (offset) => set({ searchOffset: offset }),
  searchHasMore: false,
  setSearchHasMore: (hasMore) => set({ searchHasMore: hasMore }),
  searchError: null,
  setSearchError: (error) => set({ searchError: error }),
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  selectedDocumentId: null,
  setSelectedDocumentId: (id) => set({ selectedDocumentId: id }),
  selectedSnippet: null,
  setSelectedSnippet: (snippet) => set({ selectedSnippet: snippet }),
  documentViewMode: "full",
  setDocumentViewMode: (mode) => set({ documentViewMode: mode }),
  selectSearchResult: (result, query) =>
    set({
      selectedDocumentId: result.path,
      selectedSnippet: result.snippet,
      searchQuery: query,
      documentViewMode: "snippet",
    }),
  searchResults: [],
  setSearchResults: (results) => set({ searchResults: results }),
  documentContent: null,
  documentMatchOffset: null,
  documentLoading: false,
  documentError: null,
  setDocumentContent: (content) => set({ documentContent: content }),
  setDocumentMatchOffset: (offset) => set({ documentMatchOffset: offset }),
  setDocumentLoading: (loading) => set({ documentLoading: loading }),
  setDocumentError: (error) => set({ documentError: error }),
  resetDocument: () =>
    set({
      documentContent: null,
      documentMatchOffset: null,
      documentLoading: false,
      documentError: null,
    }),
  scanMessage: null,
  scanError: null,
  indexedFileCount: 0,
  setScanMessage: (message) => set({ scanMessage: message }),
  setScanError: (error) => set({ scanError: error }),
  setIndexedFileCount: (count) => set({ indexedFileCount: count }),
}));
