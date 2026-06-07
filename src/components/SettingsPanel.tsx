import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const currentFolder = localStorage.getItem("currentFolder") || "Not set";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-96 max-w-full mx-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Settings</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Current indexed folder
            </p>
            <p className="text-sm text-slate-700 break-all">{currentFolder}</p>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
              Index management
            </p>
            <button
              onClick={handleClearIndex}
              disabled={clearing}
              className="w-full px-3 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {clearing ? "Clearing..." : "Clear Index"}
            </button>
            {clearMessage && (
              <p className="mt-2 text-sm text-green-600">{clearMessage}</p>
            )}
            {clearError && (
              <p className="mt-2 text-sm text-red-600">{clearError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}