/**
 * Frame navigation seekbar component.
 *
 * Matches SLEAP's VideoSlider with:
 * - Frame scrubbing (click and drag)
 * - Marks for labeled frames (colored dots)
 * - Track occupancy bars
 * - Frame counter display
 * - Selection range
 */

import { useRef, useCallback, useState, useEffect } from "react";
import { useAppStore } from "../../stores/appStore";
import { getPaletteColor, rgbToCSS } from "../../lib/colorPalettes";

/** Playback speed presets. */
const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

export function Seekbar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const video = useAppStore((s) => s.video);
  const frameIdx = useAppStore((s) => s.frameIdx);
  const labels = useAppStore((s) => s.labels);
  const palette = useAppStore((s) => s.palette);
  const setFrameIdx = useAppStore((s) => s.setFrameIdx);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Assumed FPS for playback (30 fps default)
  const fps = 30;

  // Use video shape if available, otherwise infer from labeled frames
  const shapeFrames = video?.shape?.[0] ?? null;
  const inferredFrames = labels && video
    ? Math.max(0, ...labels.find({ video }).map((lf) => lf.frameIdx)) + 1
    : 0;
  const totalFrames = shapeFrames ?? (inferredFrames > 0 ? inferredFrames : 0);

  const [isDragging, setIsDragging] = useState(false);
  const [hoverFrame, setHoverFrame] = useState<number | null>(null);

  // Convert pixel X to frame index
  const pixelToFrame = useCallback(
    (clientX: number): number => {
      const canvas = canvasRef.current;
      if (!canvas || totalFrames === 0) return 0;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * (totalFrames - 1));
    },
    [totalFrames]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const frame = pixelToFrame(e.clientX);
      setFrameIdx(frame);
      setIsDragging(true);
    },
    [pixelToFrame, setFrameIdx]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const frame = pixelToFrame(e.clientX);
      setHoverFrame(frame);
      if (isDragging) {
        setFrameIdx(frame);
      }
    },
    [isDragging, pixelToFrame, setFrameIdx]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
    setHoverFrame(null);
  }, []);

  // Render seekbar
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const w = rect.width;
    const h = rect.height;

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    if (totalFrames === 0) return;

    const frameToX = (f: number) => (f / (totalFrames - 1)) * w;

    // Draw track occupancy bars
    if (labels) {
      const tracks = labels.tracks;
      const trackBarHeight = Math.min(4, (h - 20) / Math.max(tracks.length, 1));

      tracks.forEach((track, trackIdx) => {
        const color = getPaletteColor(palette, trackIdx);
        ctx.fillStyle = rgbToCSS(color, 0.6);

        // Find frames where this track has instances
        for (const lf of labels.labeledFrames) {
          if (lf.video !== useAppStore.getState().video) continue;
          const hasTrack = lf.instances.some((inst) => inst.track === track);
          if (hasTrack) {
            const x = frameToX(lf.frameIdx);
            ctx.fillRect(x, trackIdx * trackBarHeight, Math.max(1, w / totalFrames), trackBarHeight - 1);
          }
        }
      });
    }

    // Draw labeled frame marks
    if (labels) {
      const currentVideo = useAppStore.getState().video;
      for (const lf of labels.labeledFrames) {
        if (lf.video !== currentVideo) continue;
        const x = frameToX(lf.frameIdx);

        const hasUser = lf.instances.some((i) => !("score" in i));
        const hasPred = lf.instances.some((i) => "score" in i);

        if (hasUser) {
          ctx.fillStyle = "#3b82f6"; // blue
        } else if (hasPred) {
          ctx.fillStyle = "#67e8f9"; // light blue
        } else {
          ctx.fillStyle = "#666";
        }
        ctx.fillRect(x - 0.5, h - 12, 1, 8);
      }
    }

    // Draw current frame indicator
    const curX = frameToX(frameIdx);
    ctx.fillStyle = "#fff";
    ctx.fillRect(curX - 1, 0, 2, h);

    // Draw hover indicator
    if (hoverFrame !== null) {
      const hx = frameToX(hoverFrame);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(hx - 0.5, 0, 1, h);
    }
  }, [frameIdx, totalFrames, labels, palette, hoverFrame, video]);

  // Playback animation loop
  useEffect(() => {
    if (!isPlaying) return;

    const interval = 1000 / (fps * playbackSpeed);
    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - lastTimeRef.current;
      if (elapsed >= interval) {
        lastTimeRef.current = now - (elapsed % interval);
        useAppStore.getState().incrementFrameIdx(1);
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, playbackSpeed, fps]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      // Trigger re-render
      useAppStore.getState().setFrameIdx(useAppStore.getState().frameIdx);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex items-center h-10 bg-[var(--color-sleap-surface)] border-t border-[var(--color-sleap-border)] px-2 gap-2 shrink-0">
      {/* Frame counter */}
      <div className="text-xs text-[var(--color-sleap-text-muted)] w-24 text-right tabular-nums shrink-0">
        {totalFrames > 0 ? `${frameIdx} / ${totalFrames - 1}` : "---"}
      </div>

      {/* Seekbar canvas */}
      <div
        ref={containerRef}
        className="flex-1 h-6 rounded cursor-pointer overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: "block" }}
        />
      </div>

      {/* Transport controls */}
      <div className="flex gap-1 shrink-0 items-center">
        <NavButton
          label="&#x23EA;"
          title="Previous large step (Ctrl+Shift+Left)"
          onClick={() => useAppStore.getState().incrementFrameIdx(-100)}
        />
        <NavButton
          label="&#x25C0;"
          title="Previous frame (Left)"
          onClick={() => useAppStore.getState().incrementFrameIdx(-1)}
        />
        <button
          title={isPlaying ? "Pause" : "Play"}
          onClick={() => setIsPlaying(!isPlaying)}
          className={`w-7 h-6 flex items-center justify-center text-xs rounded transition-colors ${
            isPlaying
              ? "bg-[var(--color-sleap-primary)] text-white"
              : "text-[var(--color-sleap-text-muted)] hover:text-white hover:bg-[var(--color-sleap-border)]"
          }`}
        >
          {isPlaying ? "\u23F8" : "\u25B6"}
        </button>
        <NavButton
          label="&#x25B6;"
          title="Next frame (Right)"
          onClick={() => useAppStore.getState().incrementFrameIdx(1)}
        />
        <NavButton
          label="&#x23E9;"
          title="Next large step (Ctrl+Shift+Right)"
          onClick={() => useAppStore.getState().incrementFrameIdx(100)}
        />
        {/* Speed indicator */}
        <button
          title="Click to cycle playback speed"
          onClick={() => {
            const idx = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
            const next = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
            setPlaybackSpeed(next);
          }}
          className="text-[9px] text-[var(--color-sleap-text-muted)] hover:text-white w-8 text-center tabular-nums"
        >
          {playbackSpeed}x
        </button>
      </div>
    </div>
  );
}

function NavButton({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-6 h-6 flex items-center justify-center text-[10px] text-[var(--color-sleap-text-muted)] hover:text-white hover:bg-[var(--color-sleap-border)] rounded transition-colors"
    >
      {label}
    </button>
  );
}
