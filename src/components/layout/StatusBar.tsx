/**
 * Bottom status bar showing current state information.
 */

import { useAppStore } from "../../stores/appStore";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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
    <div className="flex items-center h-7 px-2 text-xs bg-card border-t border-border text-muted-foreground gap-2 shrink-0">
      {filename ? (
        <>
          <span className="text-foreground">
            {filename}
            {hasChanges ? " *" : ""}
          </span>
          <Separator orientation="vertical" className="h-3.5" />
          <span>
            Frame {frameIdx}
            {totalFrames !== null ? ` / ${totalFrames - 1}` : ""}
          </span>
          <Separator orientation="vertical" className="h-3.5" />
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 rounded-sm font-normal">
            {totalLabeledFrames} labeled
          </Badge>
          <Separator orientation="vertical" className="h-3.5" />
          <span>
            {totalVideos} video{totalVideos !== 1 ? "s" : ""}
          </span>
          {instanceCount > 0 && (
            <>
              <Separator orientation="vertical" className="h-3.5" />
              <span>
                {instanceCount} instance{instanceCount !== 1 ? "s" : ""}
              </span>
            </>
          )}
          {instance && (
            <>
              <Separator orientation="vertical" className="h-3.5" />
              <Badge
                variant={isPredicted ? "outline" : "default"}
                className="text-[10px] px-1.5 py-0 h-4 rounded-sm font-normal"
              >
                {isPredicted ? "Pred" : "User"}
              </Badge>
              <span>
                {instance.track?.name ?? "[no track]"} ({instance.nVisible}/
                {instance.points.length} nodes)
                {isPredicted &&
                  ` score=${(instance as unknown as { score: number }).score.toFixed(3)}`}
              </span>
            </>
          )}
        </>
      ) : (
        <span>No project loaded</span>
      )}
    </div>
  );
}
