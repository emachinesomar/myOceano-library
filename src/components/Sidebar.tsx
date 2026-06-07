import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore } from "../store/uiStore";
import { cn } from "../lib/utils";

interface IndexedFile {
  path: string;
  name: string;
  type: string;
}

async function fetchIndexedFiles(): Promise<IndexedFile[]> {
  try {
    const raw = await invoke<string>("list_files", { folderPath: "" });
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

export function Sidebar() {
  const [currentFolder, setCurrentFolder] = useState<string | null>(() =>
    localStorage.getItem("currentFolder")
  );
  const [loading, setLoading] = useState(false);

  const scanMessage = useUIStore((s) => s.scanMessage);
  const scanError = useUIStore((s) => s.scanError);
  const setScanMessage = useUIStore((s) => s.setScanMessage);
  const setScanError = useUIStore((s) => s.setScanError);
  const setIndexedFileCount = useUIStore((s) => s.setIndexedFileCount);

  const refreshFileCount = useCallback(async () => {
    const files = await fetchIndexedFiles();
    setIndexedFileCount(files.length);
  }, [setIndexedFileCount]);

  useEffect(() => {
    refreshFileCount();
  }, [refreshFileCount]);

  useEffect(() => {
    if (!scanMessage) return;
    const timer = setTimeout(() => setScanMessage(null), 8000);
    return () => clearTimeout(timer);
  }, [scanMessage, setScanMessage]);

  const scanFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Seleccionar carpeta para indexar",
      });

      if (selected && typeof selected === "string") {
        setLoading(true);
        setScanMessage(null);
        setScanError(null);
        setCurrentFolder(selected);
        localStorage.setItem("currentFolder", selected);

        const result = await invoke<string>("scan_folder", {
          folderPath: selected,
        });
        setScanMessage(result);
        await refreshFileCount();
        setLoading(false);
      }
    } catch (error) {
      setScanError(error instanceof Error ? error.message : String(error));
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-700/80">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">
          Biblioteca local
        </p>
        <button
          onClick={scanFolder}
          disabled={loading}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all",
            "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/30",
            "disabled:opacity-60 disabled:cursor-not-allowed"
          )}
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Indexando…</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span>Escanear carpeta</span>
            </>
          )}
        </button>
      </div>

      {scanMessage && (
        <div className="mx-4 mt-3 px-3 py-2.5 rounded-lg bg-emerald-900/40 border border-emerald-700/50 text-emerald-100 text-xs leading-relaxed">
          {scanMessage}
        </div>
      )}

      {scanError && (
        <div className="mx-4 mt-3 px-3 py-2.5 rounded-lg bg-red-900/40 border border-red-700/50 text-red-100 text-xs leading-relaxed">
          {scanError}
        </div>
      )}

      {currentFolder ? (
        <div className="px-4 py-4 border-b border-slate-700/80">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Carpeta activa</p>
          <p className="text-sm text-slate-200 font-medium truncate mb-1" title={currentFolder}>
            {currentFolder.split(/[/\\]/).pop()}
          </p>
          <p className="text-[11px] text-slate-500 break-all leading-relaxed line-clamp-2" title={currentFolder}>
            {currentFolder}
          </p>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col px-4 py-4">
        {!currentFolder ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </div>
            <p className="text-sm text-slate-400 mb-2">Sin carpeta indexada</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Escanea una carpeta con textos PDF o TXT para empezar a buscar
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Primeros pasos</p>
            <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside leading-relaxed">
              <li>Usa la barra de búsqueda (Ctrl+K)</li>
              <li>Explora resultados en el panel central</li>
              <li>Haz clic para leer la coincidencia</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
