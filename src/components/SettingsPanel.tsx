import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const currentFolder = localStorage.getItem("currentFolder") || "Sin configurar";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleClearIndex = async () => {
    setClearing(true);
    setClearMessage(null);
    setClearError(null);
    try {
      const result = await invoke<string>("clear_index");
      setClearMessage(result);
    } catch (error) {
      setClearError(error instanceof Error ? error.message : String(error));
    } finally {
      setClearing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
          <h3 id="settings-title" className="font-semibold text-slate-800">
            Ajustes
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Cerrar ajustes"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Carpeta indexada
            </p>
            <p className="text-sm text-slate-700 break-all leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
              {currentFolder}
            </p>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Gestión del índice
            </p>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              Borra el índice de búsqueda y los metadatos. Tendrás que volver a escanear la carpeta.
            </p>
            <button
              onClick={handleClearIndex}
              disabled={clearing}
              className="w-full px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {clearing ? "Borrando índice…" : "Borrar índice"}
            </button>
            {clearMessage && (
              <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                {clearMessage}
              </p>
            )}
            {clearError && (
              <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {clearError}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
