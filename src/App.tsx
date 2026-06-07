import { Layout } from "./components/Layout";
import { DocumentViewer } from "./components/DocumentViewer";
import { useUIStore } from "./store/uiStore";

function App() {
  const selectedDocumentId = useUIStore((state) => state.selectedDocumentId);

  return (
    <Layout>{selectedDocumentId ? <DocumentViewer /> : <WelcomeScreen />}</Layout>
  );
}

function WelcomeScreen() {
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="max-w-xl w-full">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm shadow-slate-200/40 p-8 sm:p-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-cyan-500/20">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-3 tracking-tight">
            Ocean Library
          </h1>
          <p className="text-slate-500 mb-8 leading-relaxed text-sm sm:text-base">
            Tu biblioteca personal de textos sagrados con búsqueda booleana instantánea.
            Indexa una carpeta y encuentra cualquier pasaje al momento.
          </p>

          <div className="grid sm:grid-cols-3 gap-3 text-left mb-8">
            <div className="rounded-xl p-4 bg-slate-50 border border-slate-200/80">
              <div className="w-9 h-9 rounded-lg bg-cyan-100 flex items-center justify-center mb-2.5">
                <span className="text-cyan-700 font-bold text-sm">1</span>
              </div>
              <h3 className="font-semibold text-slate-800 text-sm mb-1">Indexar</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Escanea una carpeta con PDF o TXT desde el panel lateral
              </p>
            </div>
            <div className="rounded-xl p-4 bg-slate-50 border border-slate-200/80">
              <div className="w-9 h-9 rounded-lg bg-cyan-100 flex items-center justify-center mb-2.5">
                <span className="text-cyan-700 font-bold text-sm">2</span>
              </div>
              <h3 className="font-semibold text-slate-800 text-sm mb-1">Buscar</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Usa la barra superior con AND, OR, frases exactas y comodines
              </p>
            </div>
            <div className="rounded-xl p-4 bg-slate-50 border border-slate-200/80 sm:col-span-1 col-span-full">
              <div className="w-9 h-9 rounded-lg bg-cyan-100 flex items-center justify-center mb-2.5">
                <span className="text-cyan-700 font-bold text-sm">3</span>
              </div>
              <h3 className="font-semibold text-slate-800 text-sm mb-1">Leer</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Haz clic en un resultado para ver la coincidencia con contexto resaltado
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Atajo de teclado:{" "}
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-500">
              Ctrl+K
            </kbd>{" "}
            para enfocar la búsqueda
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
