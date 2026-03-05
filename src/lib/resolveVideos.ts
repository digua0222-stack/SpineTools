/**
 * Resolve external video files that couldn't be loaded from the SLP.
 * When loadSlp() encounters external MP4 references, the video.backend
 * may be null because the bare filename can't be fetched in the browser.
 * This module provides helpers to locate those files via the Videos panel.
 */

import { Mp4BoxVideoBackend } from "@talmolab/sleap-io.js";
import { toast } from "sonner";
import type { Labels, Video } from "../types";

/** Extract just the basename from a path or filename. */
export function getBasename(filename: string | string[]): string {
  const f = Array.isArray(filename) ? filename[0] ?? "" : filename;
  const parts = f.split(/[\\/]/);
  return parts[parts.length - 1] ?? f;
}

/** Check if a filename looks like a fetchable URL. */
export function isFetchableUrl(filename: string | string[]): boolean {
  const f = Array.isArray(filename) ? filename[0] ?? "" : filename;
  return /^(https?:|blob:|data:)/i.test(f);
}

/** Check if a video is missing its backend (unresolved external file). */
export function isVideoMissing(video: Video): boolean {
  return video.backend === null && !isFetchableUrl(video.filename);
}

/**
 * After loadSlp() returns, detect videos with no backend (external MP4s that
 * couldn't be resolved) and notify the user via toast. Does NOT open a file
 * picker -- the user can locate files from the Videos panel instead.
 */
export async function resolveExternalVideos(labels: Labels): Promise<void> {
  const unresolvedVideos = labels.videos.filter(isVideoMissing);

  if (unresolvedVideos.length === 0) return;

  const n = unresolvedVideos.length;
  toast.info(
    `${n} video${n > 1 ? "s" : ""} not found. Use the Videos panel to locate them.`,
    {
      description: "Annotations will be visible but video frames will be blank.",
    }
  );
}

/**
 * Open a file picker for a single video and assign its backend.
 * Returns true if a video was successfully loaded.
 */
export async function resolveVideoFile(video: Video): Promise<boolean> {
  let pickedFiles: File[];

  try {
    if ("showOpenFilePicker" in window) {
      const handles = await (window as any).showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Video files",
            accept: { "video/*": [".mp4", ".avi", ".mov", ".mkv", ".webm"] },
          },
        ],
      });
      pickedFiles = await Promise.all(
        handles.map((h: any) => h.getFile() as Promise<File>)
      );
    } else {
      pickedFiles = await new Promise<File[]>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "video/*";
        input.onchange = () => {
          const files = input.files ? Array.from(input.files) : [];
          resolve(files);
        };
        input.addEventListener("cancel", () => resolve([]));
        input.click();
      });
    }
  } catch {
    return false;
  }

  if (pickedFiles.length === 0) return false;

  await assignVideoBackend(video, pickedFiles[0]);
  toast.success(`Loaded video: ${pickedFiles[0].name}`);
  return true;
}

/**
 * Open a multi-file picker to batch-resolve multiple missing videos.
 * Matches picked files to videos by basename (case-insensitive).
 * Returns the number of videos successfully resolved.
 */
export async function resolveAllVideoFiles(
  videos: Video[]
): Promise<number> {
  const unresolvedVideos = videos.filter(isVideoMissing);
  if (unresolvedVideos.length === 0) return 0;

  let pickedFiles: File[];

  try {
    if ("showOpenFilePicker" in window) {
      const handles = await (window as any).showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: "Video files",
            accept: { "video/*": [".mp4", ".avi", ".mov", ".mkv", ".webm"] },
          },
        ],
      });
      pickedFiles = await Promise.all(
        handles.map((h: any) => h.getFile() as Promise<File>)
      );
    } else {
      pickedFiles = await new Promise<File[]>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = "video/*";
        input.onchange = () => {
          const files = input.files ? Array.from(input.files) : [];
          resolve(files);
        };
        input.addEventListener("cancel", () => resolve([]));
        input.click();
      });
    }
  } catch {
    toast.warning("Video file selection cancelled");
    return 0;
  }

  if (pickedFiles.length === 0) {
    toast.warning("No video files selected");
    return 0;
  }

  let matchCount = 0;

  for (const video of unresolvedVideos) {
    const expectedName = getBasename(video.filename).toLowerCase();
    const matchedFile = pickedFiles.find(
      (f) => f.name.toLowerCase() === expectedName
    );

    if (matchedFile) {
      await assignVideoBackend(video, matchedFile);
      matchCount++;
    }
  }

  // Special case: 1 unresolved video + 1 picked file -> assign even if names don't match
  if (
    matchCount === 0 &&
    unresolvedVideos.length === 1 &&
    pickedFiles.length === 1
  ) {
    await assignVideoBackend(unresolvedVideos[0], pickedFiles[0]);
    matchCount = 1;
  }

  if (matchCount > 0) {
    toast.success(`Loaded ${matchCount} video${matchCount > 1 ? "s" : ""}`);
  }

  if (matchCount < unresolvedVideos.length) {
    const remaining = unresolvedVideos.length - matchCount;
    toast.warning(
      `${remaining} video${remaining > 1 ? "s" : ""} could not be matched`,
      {
        description:
          "Annotations will be visible but some video frames will be blank.",
      }
    );
  }

  return matchCount;
}

/**
 * Create an Mp4BoxVideoBackend from a user-picked File and assign it to a Video.
 */
export async function assignVideoBackend(video: Video, file: File): Promise<void> {
  try {
    const backend = new Mp4BoxVideoBackend(file);
    video.backend = backend;
    // Trigger initialization by requesting a frame, then discard it
    const frame = await backend.getFrame(0);
    if (frame && "close" in frame) (frame as ImageBitmap).close();
    if (backend.shape) video.shape = backend.shape;
    if (backend.fps) video.fps = backend.fps;
  } catch (err) {
    console.error(`Failed to load video backend for ${file.name}:`, err);
    toast.error(`Failed to load video: ${file.name}`, {
      description: err instanceof Error ? err.message : String(err),
    });
  }
}
