import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

export function Sidebar() {
  const [currentFolder, setCurrentFolder] = useState<string | null>(() =>
    localStorage.getItem("currentFolder")
  );
  const [loading, setLoading] = useState(false);

  const scanFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select a folder to scan",
      });

      if (selected && typeof selected === "string") {
        setLoading(true);
        setCurrentFolder(selected);
        localStorage.setItem("currentFolder", selected);

        const result = await invoke<string>("scan_folder", {
          folderPath: selected,
        });
        console.log("Scan result:", result);
        setLoading(false);
      }
    } catch (error) {
      console.error("Scan error:", error);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Scan Button */}
      <div className="p-4 border-b border-slate-700">
        <button
          onClick={scanFolder}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span>Scanning...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>Scan Folder</span>
            </>
          )}
        </button>
      </div>

      {/* Current Folder */}
      {currentFolder && (
        <div className="px-4 py-3 border-b border-slate-700">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Current</p>
          <p className="text-sm text-slate-200 truncate" title={currentFolder}>
            {currentFolder.split(/[/\\]/).pop()}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!currentFolder && (
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-slate-500 text-sm text-center">
            Click &quot;Scan Folder&quot; to index your documents
          </p>
        </div>
      )}
    </div>
  );
}
