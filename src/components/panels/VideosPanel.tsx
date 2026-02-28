/**
 * Videos panel: lists all videos in the project.
 *
 * Shows filename (truncated from left), frame count, and resolution.
 * Click to select a video as the active video.
 */

import { useAppStore } from "../../stores/appStore";
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
import { Separator } from "@/components/ui/separator";
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
    <TableRow
      onClick={onSelect}
      className={cn(
        "cursor-pointer border-b-0",
        isSelected
          ? "bg-orange-500/10 border-l-2 border-l-orange-500 text-foreground"
          : "hover:bg-muted/50 text-foreground"
      )}
    >
      <TableCell className="py-0.5 px-2 text-xs text-muted-foreground">
        {index + 1}
      </TableCell>
      <TableCell
        className="py-0.5 px-2 text-xs"
        title={
          Array.isArray(video.filename) ? video.filename[0] : video.filename
        }
      >
        {truncateLeft(basename(video.filename), 30)}
      </TableCell>
      <TableCell className="py-0.5 px-2 text-xs text-right tabular-nums">
        {frameCount}
      </TableCell>
      <TableCell className="py-0.5 px-2 text-xs text-right tabular-nums text-muted-foreground">
        {width}x{height}
      </TableCell>
    </TableRow>
  );
}

export function VideosPanel() {
  const labels = useAppStore((s) => s.labels);
  const currentVideo = useAppStore((s) => s.video);
  const setVideo = useAppStore((s) => s.setVideo);

  const videos = labels?.videos ?? [];

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        {videos.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">
            No videos in project.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b hover:bg-transparent">
                <TableHead className="py-1 px-2 text-xs font-normal h-auto">
                  #
                </TableHead>
                <TableHead className="py-1 px-2 text-xs font-normal h-auto">
                  Filename
                </TableHead>
                <TableHead className="py-1 px-2 text-xs font-normal text-right h-auto">
                  Frames
                </TableHead>
                <TableHead className="py-1 px-2 text-xs font-normal text-right h-auto">
                  Size
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.map((video, i) => (
                <VideoRow
                  key={i}
                  video={video}
                  index={i}
                  isSelected={video === currentVideo}
                  onSelect={() => setVideo(video)}
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
          onClick={() => console.log("Add Videos")}
        >
          Add Videos
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => console.log("Remove Video")}
        >
          Remove Video
        </Button>
      </div>
    </div>
  );
}
