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
  // Stage 4 — search results for ResultTree
  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;
  // Stage 2 — full document viewer state
  documentContent: string | null;
  documentMatchOffset: number | null;
  documentLoading: boolean;
  documentError: string | null;
  setDocumentContent: (content: string | null) => void;
  setDocumentMatchOffset: (offset: number | null) => void;
  setDocumentLoading: (loading: boolean) => void;
  setDocumentError: (error: string | null) => void;
  resetDocument: () => void;
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
}));
