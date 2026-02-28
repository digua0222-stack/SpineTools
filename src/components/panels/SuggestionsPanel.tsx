/**
 * Suggestions panel: lists suggested frames for labeling.
 *
 * Shows video name and frame index for each suggestion.
 * Click to navigate to that frame.
 */

import { useAppStore } from "../../stores/appStore";
import type { SuggestionFrame } from "../../types";

/** Extract just the basename from a file path. */
function basename(path: string | string[]): string {
  const p = Array.isArray(path) ? path[0] ?? "" : path;
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}

function SuggestionRow({
  suggestion,
  index,
  isActive,
  onNavigate,
}: {
  suggestion: SuggestionFrame;
  index: number;
  isActive: boolean;
  onNavigate: () => void;
}) {
  return (
    <tr
      onClick={onNavigate}
      className={`cursor-pointer transition-colors ${
        isActive
          ? "bg-[var(--color-sleap-primary)]/20 text-white"
          : "hover:bg-[var(--color-sleap-border)]/50 text-[var(--color-sleap-text)]"
      }`}
    >
      <td className="py-1 px-2 text-xs text-[var(--color-sleap-text-muted)]">
        {index + 1}
      </td>
      <td className="py-1 px-2 text-xs">
        {basename(suggestion.video.filename)}
      </td>
      <td className="py-1 px-2 text-xs text-right tabular-nums">
        {suggestion.frameIdx}
      </td>
    </tr>
  );
}

export function SuggestionsPanel() {
  const labels = useAppStore((s) => s.labels);
  const currentVideo = useAppStore((s) => s.video);
  const frameIdx = useAppStore((s) => s.frameIdx);
  const setVideo = useAppStore((s) => s.setVideo);
  const setFrameIdx = useAppStore((s) => s.setFrameIdx);

  const suggestions = labels?.suggestions ?? [];

  const navigateToSuggestion = (suggestion: SuggestionFrame) => {
    // Switch video if needed, then set frame
    if (suggestion.video !== currentVideo) {
      setVideo(suggestion.video);
    }
    setFrameIdx(suggestion.frameIdx);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Count header */}
      <div className="px-2 py-1.5 border-b border-[var(--color-sleap-border)]">
        <span className="text-xs text-[var(--color-sleap-text-muted)]">
          {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {suggestions.length === 0 ? (
          <p className="text-xs text-[var(--color-sleap-text-muted)] p-2">
            No suggestions generated.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-[var(--color-sleap-text-muted)]">
                <th className="py-1 px-2 text-xs font-normal">#</th>
                <th className="py-1 px-2 text-xs font-normal">Video</th>
                <th className="py-1 px-2 text-xs font-normal text-right">Frame</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((suggestion, i) => (
                <SuggestionRow
                  key={i}
                  suggestion={suggestion}
                  index={i}
                  isActive={
                    suggestion.video === currentVideo &&
                    suggestion.frameIdx === frameIdx
                  }
                  onNavigate={() => navigateToSuggestion(suggestion)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 p-2 border-t border-[var(--color-sleap-border)]">
        <button
          className="px-2 py-1 text-xs bg-[var(--color-sleap-surface)] hover:bg-[var(--color-sleap-border)] text-[var(--color-sleap-text)] rounded transition-colors"
          onClick={() => console.log("Generate Suggestions")}
        >
          Generate Suggestions
        </button>
        <button
          className="px-2 py-1 text-xs bg-[var(--color-sleap-surface)] hover:bg-[var(--color-sleap-border)] text-[var(--color-sleap-text)] rounded transition-colors"
          onClick={() => console.log("Clear Suggestions")}
        >
          Clear Suggestions
        </button>
      </div>
    </div>
  );
}
