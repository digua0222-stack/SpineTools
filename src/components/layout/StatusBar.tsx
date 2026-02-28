/**
 * Bottom status bar showing current state information.
 */

import { useAppStore } from "../../stores/appStore";

export function StatusBar() {
  const filename = useAppStore((s) => s.filename);
  const frameIdx = useAppStore((s) => s.frameIdx);
  const video = useAppStore((s) => s.video);
  const labels = useAppStore((s) => s.labels);
  const hasChanges = useAppStore((s) => s.hasChanges);
  const instance = useAppStore((s) => s.instance);
  const labeledFrame = useAppStore((s) => s.labeledFrame);

  const totalFrames = video?.shape?.[0] ?? null;
  const totalLabeledFrames = labels?.labeledFrames.length ?? 0;
  const totalVideos = labels?.videos.length ?? 0;
  const instanceCount = labeledFrame?.instances.length ?? 0;
  const isPredicted = instance && "score" in instance;

  return (
    <div className="flex items-center h-6 px-2 text-xs bg-[var(--color-sleap-surface)] border-t border-[var(--color-sleap-border)] text-[var(--color-sleap-text-muted)] gap-4 shrink-0">
      {filename && (
        <>
          <span>
            {filename}
            {hasChanges ? " *" : ""}
          </span>
          <span className="text-[var(--color-sleap-border)]">|</span>
          <span>
            Frame {frameIdx}{totalFrames !== null ? ` / ${totalFrames - 1}` : ""}
          </span>
          <span className="text-[var(--color-sleap-border)]">|</span>
          <span>{totalLabeledFrames} labeled frames</span>
          <span className="text-[var(--color-sleap-border)]">|</span>
          <span>{totalVideos} video{totalVideos !== 1 ? "s" : ""}</span>
          {instanceCount > 0 && (
            <>
              <span className="text-[var(--color-sleap-border)]">|</span>
              <span>{instanceCount} instance{instanceCount !== 1 ? "s" : ""}</span>
            </>
          )}
          {instance && (
            <>
              <span className="text-[var(--color-sleap-border)]">|</span>
              <span>
                {isPredicted ? "Pred" : "User"}: {instance.track?.name ?? "[no track]"}
                {" "}({instance.nVisible}/{instance.points.length} nodes)
                {isPredicted && ` score=${(instance as unknown as { score: number }).score.toFixed(3)}`}
              </span>
            </>
          )}
        </>
      )}
      {!filename && <span>No project loaded</span>}
    </div>
  );
}
