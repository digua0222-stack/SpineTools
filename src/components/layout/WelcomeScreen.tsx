/**
 * Welcome screen shown when no project is loaded.
 * Provides buttons to open a project or drag-and-drop an SLP file.
 */

import { useCallback } from "react";
import { useFileIO } from "../../hooks/useFileIO";

export function WelcomeScreen() {
  const { openProject, openFromDrop, loading, error } = useFileIO();

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".slp")) {
        openFromDrop(file);
      }
    },
    [openFromDrop]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  return (
    <div
      className="flex-1 flex items-center justify-center"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="text-center space-y-6 max-w-md">
        <h1 className="text-3xl font-bold text-white">SLEAP Label</h1>
        <p className="text-[var(--color-sleap-text-muted)]">
          Open a SLEAP project (.slp) to start labeling
        </p>

        <button
          onClick={openProject}
          disabled={loading}
          className="px-6 py-3 bg-[var(--color-sleap-primary)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Loading..." : "Open Project"}
        </button>

        <div className="border-2 border-dashed border-[var(--color-sleap-border)] rounded-lg p-8 text-[var(--color-sleap-text-muted)]">
          or drag and drop a .slp file here
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded">
            {error}
          </div>
        )}

        <div className="text-xs text-[var(--color-sleap-text-muted)] space-y-1">
          <p>Keyboard shortcut: Ctrl+O</p>
        </div>
      </div>
    </div>
  );
}
