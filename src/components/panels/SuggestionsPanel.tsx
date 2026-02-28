/**
 * Suggestions panel: lists suggested frames for labeling.
 *
 * Shows video name and frame index for each suggestion.
 * Click to navigate to that frame.
 */

import { useAppStore } from "../../stores/appStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
    <TableRow
      onClick={onNavigate}
      className={cn(
        "cursor-pointer border-b-0",
        isActive
          ? "bg-orange-500/10 border-l-2 border-l-orange-500 text-foreground"
          : "hover:bg-muted/50 text-foreground"
      )}
    >
      <TableCell className="py-0.5 px-2 text-xs text-muted-foreground">
        {index + 1}
      </TableCell>
      <TableCell className="py-0.5 px-2 text-xs">
        {basename(suggestion.video.filename)}
      </TableCell>
      <TableCell className="py-0.5 px-2 text-xs text-right tabular-nums">
        {suggestion.frameIdx}
      </TableCell>
    </TableRow>
  );
}

/** Generate evenly-spaced frame suggestions for all videos. */
function generateSuggestions(count: number) {
  const { labels } = useAppStore.getState();
  if (!labels) return;

  const suggestions: SuggestionFrame[] = [];

  for (const video of labels.videos) {
    const totalFrames = video.shape?.[0] ?? 0;
    if (totalFrames === 0) continue;

    const perVideo = Math.max(1, Math.round(count / labels.videos.length));
    const step = Math.max(1, Math.floor(totalFrames / perVideo));

    for (let i = 0; i < perVideo && i * step < totalFrames; i++) {
      suggestions.push({
        video,
        frameIdx: i * step,
      } as SuggestionFrame);
    }
  }

  labels.suggestions = suggestions;
  // Force re-render via a state touch
  useAppStore.getState().markChanged();
  toast.success(`Generated ${suggestions.length} suggestions`, {
    description: `Evenly spaced across ${labels.videos.length} video(s)`,
  });
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
      <div className="px-2 py-1.5 border-b border-border">
        <Badge variant="secondary" className="text-xs">
          {suggestions.length} suggestion
          {suggestions.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        {suggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">
            No suggestions generated. Click "Generate Suggestions" to create evenly-spaced frame suggestions.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b hover:bg-transparent">
                <TableHead className="py-1 px-2 text-xs font-normal h-auto">
                  #
                </TableHead>
                <TableHead className="py-1 px-2 text-xs font-normal h-auto">
                  Video
                </TableHead>
                <TableHead className="py-1 px-2 text-xs font-normal text-right h-auto">
                  Frame
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
            </TableBody>
          </Table>
        )}
      </ScrollArea>

      <Separator />
      <div className="flex gap-1 p-2">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => generateSuggestions(20)}
        >
          Generate Suggestions
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            if (!labels) return;
            labels.suggestions = [];
            useAppStore.getState().markChanged();
            toast.info("Suggestions cleared");
          }}
        >
          Clear Suggestions
        </Button>
      </div>
    </div>
  );
}
