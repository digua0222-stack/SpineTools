/**
 * Videos panel: lists all videos in the project.
 *
 * Shows filename (truncated from left), frame count, and resolution.
 * Click to select a video as the active video.
 */

import { useAppStore } from "../../stores/appStore";
import type { Video } from "../../types";

/** Truncate a filename/path from the left, keeping the rightmost characters. */
function truncateLeft(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path;
  return "\u2026" + path.slice(path.length - maxLen + 1);
}

/** Extract just the basename from a file path. */
function basename(path: string | string[]): string {
  const p = Array.isArray(path) ? path[0] ?? "" : path;
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}

function VideoRow({
  video,
  index,
  isSelected,
  onSelect,
}: {
  video: Video;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const shape = video.shape;
  const frameCount = shape?.[0] ?? "?";
  const height = shape?.[1] ?? "?";
  const width = shape?.[2] ?? "?";

  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer transition-colors ${
        isSelected
          ? "bg-[var(--color-sleap-primary)]/20 text-white"
          : "hover:bg-[var(--color-sleap-border)]/50 text-[var(--color-sleap-text)]"
      }`}
    >
      <td className="py-1 px-2 text-xs text-[var(--color-sleap-text-muted)]">
        {index + 1}
      </td>
      <td className="py-1 px-2 text-xs" title={Array.isArray(video.filename) ? video.filename[0] : video.filename}>
        {truncateLeft(basename(video.filename), 30)}
      </td>
      <td className="py-1 px-2 text-xs text-right tabular-nums">
        {frameCount}
      </td>
      <td className="py-1 px-2 text-xs text-right tabular-nums text-[var(--color-sleap-text-muted)]">
        {width}x{height}
      </td>
    </tr>
  );
}

export function VideosPanel() {
  const labels = useAppStore((s) => s.labels);
  const currentVideo = useAppStore((s) => s.video);
  const setVideo = useAppStore((s) => s.setVideo);

  const videos = labels?.videos ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Table */}
      <div className="flex-1 overflow-auto">
        {videos.length === 0 ? (
          <p className="text-xs text-[var(--color-sleap-text-muted)] p-2">
            No videos in project.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-[var(--color-sleap-text-muted)]">
                <th className="py-1 px-2 text-xs font-normal">#</th>
                <th className="py-1 px-2 text-xs font-normal">Filename</th>
                <th className="py-1 px-2 text-xs font-normal text-right">Frames</th>
                <th className="py-1 px-2 text-xs font-normal text-right">Size</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video, i) => (
                <VideoRow
                  key={i}
                  video={video}
                  index={i}
                  isSelected={video === currentVideo}
                  onSelect={() => setVideo(video)}
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
          onClick={() => console.log("Add Videos")}
        >
          Add Videos
        </button>
        <button
          className="px-2 py-1 text-xs bg-[var(--color-sleap-surface)] hover:bg-[var(--color-sleap-border)] text-[var(--color-sleap-text)] rounded transition-colors"
          onClick={() => console.log("Remove Video")}
        >
          Remove Video
        </button>
      </div>
    </div>
  );
}
