/**
 * Resolve external video files that couldn't be loaded from the SLP.
 * When loadSlp() encounters external MP4 references, the video.backend
 * may be null because the bare filename can't be fetched in the browser.
 * This module prompts the user to locate those files via a file picker.
 */

import { Mp4BoxVideoBackend } from "@talmolab/sleap-io.js";
import { toast } from "sonner";
import type { Labels, Video } from "../types";

/** Extract just the basename from a path or filename. */
function getBasename(filename: string | string[]): string {
  const f = Array.isArray(filename) ? filename[0] ?? "" : filename;
  const parts = f.split(/[\\/]/);
  return parts[parts.length - 1] ?? f;
}

/** Check if a filename looks like a fetchable URL. */
function isFetchableUrl(filename: string | string[]): boolean {
  const f = Array.isArray(filename) ? filename[0] ?? "" : filename;
  return /^(https?:|blob:|data:)/i.test(f);
}

/**
 * After loadSlp() returns, detect videos with no backend (external MP4s that
 * couldn't be resolved), prompt the user to pick the video file(s), create
 * blob URLs, and assign Mp4BoxVideoBackend instances.
 */
export async function resolveExternalVideos(labels: Labels): Promise<void> {
  // Find videos that need resolution
  const unresolvedVideos = labels.videos.filter(
    (v) => v.backend === null && !isFetchableUrl(v.filename)
  );

  if (unresolvedVideos.length === 0) return;

  // Build a list of expected filenames for the toast
  const expectedNames = unresolvedVideos.map((v) => getBasename(v.filename));
  toast.info(
    `Please locate ${unresolvedVideos.length} video file${unresolvedVideos.length > 1 ? "s" : ""}: ${expectedNames.join(", ")}`
  );

  let pickedFiles: File[];

  try {
    // Try the modern File System Access API first
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
      // Fallback: hidden <input type="file">
      pickedFiles = await new Promise<File[]>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = "video/*";
        input.onchange = () => {
          const files = input.files ? Array.from(input.files) : [];
          resolve(files);
        };
        // User cancelled
        input.addEventListener("cancel", () => resolve([]));
        input.click();
      });
    }
  } catch {
    // User cancelled the picker
    toast.warning("Video file selection cancelled", {
      description: "Annotations will be visible but video frames will be blank.",
    });
    return;
  }

  if (pickedFiles.length === 0) {
    toast.warning("No video files selected", {
      description: "Annotations will be visible but video frames will be blank.",
    });
    return;
  }

  // Match picked files to expected videos by basename (case-insensitive)
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
  if (matchCount === 0 && unresolvedVideos.length === 1 && pickedFiles.length === 1) {
    await assignVideoBackend(unresolvedVideos[0], pickedFiles[0]);
    matchCount = 1;
  }

  if (matchCount > 0) {
    toast.success(
      `Loaded ${matchCount} video${matchCount > 1 ? "s" : ""}`,
    );
  }

  if (matchCount < unresolvedVideos.length) {
    const remaining = unresolvedVideos.length - matchCount;
    toast.warning(
      `${remaining} video${remaining > 1 ? "s" : ""} could not be matched`,
      {
        description: "Annotations will be visible but some video frames will be blank.",
      }
    );
  }
}

/**
 * Create an Mp4BoxVideoBackend from a user-picked File and assign it to a Video.
 *
 * We cannot use `new Mp4BoxVideoBackend(url)` because the constructor immediately
 * calls init() → openSource() → fetch(url, { method: "HEAD" }). For local files
 * (bare filenames, blob: URLs), this fetch either fails or hangs indefinitely
 * (e.g. Vite dev server may not respond to HEAD for nonexistent paths).
 *
 * Instead, we use Object.create() to build the instance without calling the
 * constructor, set fileBlob directly to the File (which extends Blob), override
 * openSource to a no-op, and call init(). The readChunk() fallback path uses
 * fileBlob.slice() when supportsRangeRequests is false, giving us lazy chunk
 * reading from the File without any network fetches.
 */
async function assignVideoBackend(video: Video, file: File): Promise<void> {
  try {
    const filename = Array.isArray(video.filename) ? video.filename[0] ?? "" : video.filename;

    // Create instance without calling constructor (avoids the hanging fetch)
    const backend: InstanceType<typeof Mp4BoxVideoBackend> = Object.create(
      Mp4BoxVideoBackend.prototype
    );

    // Replicate constructor property initialization
    // (see Mp4BoxVideoBackend constructor in sleap-io.js dist)
    const b = backend as unknown as Record<string, unknown>;
    b.filename = filename;
    b.dataset = null;
    b.samples = [];
    b.keyframeIndices = [];
    b.cache = new Map();
    b.cacheSize = 120; // DEFAULT_CACHE_SIZE
    b.lookahead = 60; // DEFAULT_LOOKAHEAD
    b.decoder = null;
    b.config = null;
    b.fileSize = file.size;
    b.supportsRangeRequests = false;
    b.fileBlob = file; // File extends Blob — readChunk uses blob.slice()
    b.isDecoding = false;
    b.pendingFrame = null;

    // Override openSource on this instance to a no-op (fileBlob already set)
    (backend as any).openSource = async () => {};

    // Run init() — skips openSource, parses mp4 headers via readChunk/fileBlob
    b.ready = (backend as any).init();
    await (b.ready as Promise<void>);

    video.backend = backend;
    if (backend.shape) {
      video.shape = backend.shape;
    }
    if (backend.fps) {
      video.fps = backend.fps;
    }
  } catch (err) {
    console.error(`Failed to load video backend for ${file.name}:`, err);
    toast.error(`Failed to load video: ${file.name}`, {
      description: err instanceof Error ? err.message : String(err),
    });
  }
}
