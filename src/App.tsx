import { Layout } from "./components/Layout";
import { DocumentViewer } from "./components/DocumentViewer";
import { useUIStore } from "./store/uiStore";

function App() {
  const selectedDocumentId = useUIStore((state) => state.selectedDocumentId);

  return <Layout>{selectedDocumentId ? <DocumentViewer /> : <WelcomeScreen />}</Layout>;
}

function WelcomeScreen() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-lg">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-cyan-500/25">
          <svg
            className="w-10 h-10 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-800 mb-3">Welcome to Ocean Library</h1>
        <p className="text-slate-500 mb-8 leading-relaxed">
          Your personal document library with intelligent search. Select a folder from the sidebar
          to start indexing and exploring your documents.
        </p>
        <div className="grid grid-cols-3 gap-4 text-left">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center mb-3">
              <svg
                className="w-5 h-5 text-cyan-600"
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
            </div>
            <h3 className="font-semibold text-slate-800 text-sm mb-1">Full-Text Search</h3>
            <p className="text-xs text-slate-500">Find exact matches in any document instantly</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center mb-3">
              <svg
                className="w-5 h-5 text-purple-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-800 text-sm mb-1">AI Search</h3>
            <p className="text-xs text-slate-500">
              Natural language queries with semantic understanding
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center mb-3">
              <svg
                className="w-5 h-5 text-amber-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-800 text-sm mb-1">PDF Support</h3>
            <p className="text-xs text-slate-500">Read and search PDF documents natively</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
