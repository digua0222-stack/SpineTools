/**
 * Hook for file I/O operations (open/save SLP files).
 *
 * Uses the platform abstraction layer to work in both Tauri and browser.
 */

import { useCallback, useState } from "react";
import { loadSlp } from "@talmolab/sleap-io.js";
import { useAppStore } from "../stores/appStore";
import { getPlatform } from "../platform";

export function useFileIO() {
  const setLabels = useAppStore((s) => s.setLabels);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openProject = useCallback(async () => {
    setError(null);
    const platform = await getPlatform();

    const result = await platform.showOpenDialog({
      filters: [{ name: "SLEAP Labels", extensions: ["slp"] }],
    });

    if (!result) return; // User cancelled

    setLoading(true);
    try {
      let labels;
      if (typeof result === "string") {
        // Tauri path - read file bytes then load
        const bytes = await platform.readFile(result);
        labels = await loadSlp(bytes.buffer, {
          openVideos: true,
          h5: { filenameHint: result },
        });
        setLabels(labels, result);
      } else {
        // Browser File object
        const buffer = await result.arrayBuffer();
        labels = await loadSlp(buffer, {
          openVideos: true,
          h5: { filenameHint: result.name },
        });
        setLabels(labels, result.name);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error("Failed to open project:", err);
    } finally {
      setLoading(false);
    }
  }, [setLabels]);

  const openFromDrop = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      try {
        const buffer = await file.arrayBuffer();
        const labels = await loadSlp(buffer, {
          openVideos: true,
          h5: { filenameHint: file.name },
        });
        setLabels(labels, file.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        console.error("Failed to load dropped file:", err);
      } finally {
        setLoading(false);
      }
    },
    [setLabels]
  );

  return { openProject, openFromDrop, loading, error };
}
