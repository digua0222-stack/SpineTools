/**
 * Main video player component.
 *
 * Contains:
 * - Video frame canvas (background layer)
 * - Skeleton overlay canvas (foreground layer with interaction)
 * - Seekbar for frame navigation
 *
 * Mirrors SLEAP's QtVideoPlayer.
 */

import { useRef, useEffect, useCallback, useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { Seekbar } from "./Seekbar";
import { ContextMenu } from "./ContextMenu";
import {
  renderInstances,
  hitTestNode,
  hitTestInstance,
  type RenderedInstance,
  type RenderedNode,
} from "../../canvas/SkeletonRenderer";
import { getPaletteColor, getInstanceColor } from "../../lib/colorPalettes";
import { renderTrails } from "../../canvas/TrailRenderer";
import {
  commandContext,
  ConvertPredictionToInstance,
  BeginEdit,
} from "../../commands";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isVideoMissing, resolveVideoFile } from "../../lib/resolveVideos";
import { Film } from "lucide-react";

export function VideoPlayer() {
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // State from store
  const video = useAppStore((s) => s.video);
  const frameIdx = useAppStore((s) => s.frameIdx);
  const labels = useAppStore((s) => s.labels);
  const selectedInstance = useAppStore((s) => s.instance);
  const showInstances = useAppStore((s) => s.showInstances);
  const showLabels = useAppStore((s) => s.showLabels);
  const showEdges = useAppStore((s) => s.showEdges);
  const showNonVisibleNodes = useAppStore((s) => s.showNonVisibleNodes);
  const colorPredicted = useAppStore((s) => s.colorPredicted);
  const fit = useAppStore((s) => s.fit);
  const edgeStyle = useAppStore((s) => s.edgeStyle);
  const markerSize = useAppStore((s) => s.markerSize);
  const nodeLabelSize = useAppStore((s) => s.nodeLabelSize);
  const palette = useAppStore((s) => s.palette);
  const overlayVersion = useAppStore((s) => s.overlayVersion);
  const distinctlyColor = useAppStore((s) => s.distinctlyColor);
  const trailLength = useAppStore((s) => s.trailLength);

  // Local zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  // Ref tracks latest zoom/pan for synchronous access in wheel handler,
  // avoiding stale closures and React batching issues with nested setState.
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  viewRef.current = { zoom, panX, panY };
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragNodeInfo, setDragNodeInfo] = useState<{
    instanceIdx: number;
    nodeIdx: number;
  } | null>(null);

  // Track the last scene position during drag for delta calculations (alt-drag)
  const lastDragPos = useRef<{ x: number; y: number } | null>(null);

  // Track whether an undo snapshot has been taken for the current rotation gesture
  const rotationSnapshotTaken = useRef(false);

  // Track frame canvas dimensions so overlay can sync after async frame load
  const [frameDims, setFrameDims] = useState<[number, number]>([0, 0]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    instanceIdx: number | null;
    nodeIdx: number | null;
  } | null>(null);

  // Rendered instances cache
  const renderedInstancesRef = useRef<RenderedInstance[]>([]);

  // Store frame as ImageBitmap so we can re-draw with transforms
  const frameBitmapRef = useRef<ImageBitmap | null>(null);

  // Track container dimensions for fit-to-window rendering
  const [containerSize, setContainerSize] = useState<[number, number]>([0, 0]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize([Math.round(width), Math.round(height)]);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Compute fit-to-window base scale and centering offsets
  const [cw, ch] = containerSize;
  const [fw, fh] = frameDims;
  const baseScale = fw > 0 && fh > 0 ? Math.min(cw / fw, ch / fh) : 1;
  const offsetX = fw > 0 && fh > 0 ? (cw - fw * baseScale) / 2 : 0;
  const offsetY = fw > 0 && fh > 0 ? (ch - fh * baseScale) / 2 : 0;

  // Load the current frame (convert to ImageBitmap, trigger dimension update)
  useEffect(() => {
    if (!video || !video.backend) return;

    let cancelled = false;

    (async () => {
      try {
        const frame = await video.backend!.getFrame(frameIdx);
        if (cancelled || !frame) return;

        let bmp: ImageBitmap;

        if (frame instanceof ImageBitmap) {
          bmp = frame;
        } else if (frame instanceof ImageData) {
          bmp = await createImageBitmap(frame);
        } else if (frame instanceof ArrayBuffer || frame instanceof Uint8Array) {
          const bytes =
            frame instanceof ArrayBuffer ? new Uint8Array(frame) : frame;
          const shape = video.shape;
          if (!shape) return;
          const [, h, w] = shape;
          const imageData = new ImageData(new Uint8ClampedArray(bytes), w, h);
          bmp = await createImageBitmap(imageData);
        } else {
          return;
        }

        if (cancelled) {
          bmp.close();
          return;
        }

        // Close previous bitmap
        frameBitmapRef.current?.close();
        frameBitmapRef.current = bmp;
        setFrameDims([bmp.width, bmp.height]);
      } catch (err) {
        console.error("Failed to render frame:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [video, frameIdx]);

  // Render the frame with fit-to-window base transform + user zoom/pan
  useEffect(() => {
    const canvas = frameCanvasRef.current;
    const bmp = frameBitmapRef.current;
    if (!canvas || !bmp) return;

    const [cw, ch] = containerSize;
    if (cw === 0 || ch === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(offsetX + panX, offsetY + panY);
    ctx.scale(baseScale * zoom, baseScale * zoom);
    ctx.imageSmoothingEnabled = baseScale * zoom <= 2;
    try {
      ctx.drawImage(bmp, 0, 0);
    } catch {
      // Bitmap was closed (detached) by a racing frame load — skip, next frame will redraw
    }
    ctx.restore();
  }, [frameDims, containerSize, zoom, panX, panY, baseScale, offsetX, offsetY]);

  // Find the current labeled frame and update store
  useEffect(() => {
    if (!labels || !video) {
      useAppStore.getState().setLabeledFrame(null);
      return;
    }

    // Use reference equality (===) to avoid basename fallback in labels.find()
    // which incorrectly matches videos sharing a container filename in .pkg.slp.
    const frames = labels.labeledFrames.filter(
      (lf) => lf.video === video && lf.frameIdx === frameIdx
    );
    const lf = frames.length > 0 ? frames[0] : null;
    useAppStore.getState().setLabeledFrame(lf);
  }, [labels, video, frameIdx]);

  // Render skeleton overlay
  const labeledFrame = useAppStore((s) => s.labeledFrame);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    // Use container dimensions for canvas size
    const [cw, ch] = containerSize;
    if (cw === 0 || ch === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, ch);

    if (!labeledFrame || !showInstances) {
      renderedInstancesRef.current = [];
      return;
    }

    // Build renderable instances
    const tracks = labels?.tracks ?? [];
    const instances: RenderedInstance[] = labeledFrame.instances.map(
      (inst, idx) => {
        const isPredicted = "score" in inst;
        const skeleton = inst.skeleton;
        const color = getInstanceColor(
          palette, distinctlyColor, idx, inst.track, tracks, isPredicted, colorPredicted
        );

        // Per-node colors when distinctlyColor === "node"
        const nodeColors = distinctlyColor === "node" && !(isPredicted && !colorPredicted)
          ? skeleton.nodes.map((_, nIdx) => getPaletteColor(palette, nIdx))
          : undefined;

        // Per-edge colors when distinctlyColor === "edge"
        const edgeIndices = skeleton.edgeIndices;
        const edgeColors = distinctlyColor === "edge" && !(isPredicted && !colorPredicted)
          ? edgeIndices.map((_, eIdx) => getPaletteColor(palette, eIdx))
          : undefined;

        const nodes: RenderedNode[] = inst.points.map((point, nIdx) => ({
          x: point.xy[0],
          y: point.xy[1],
          visible: point.visible && !isNaN(point.xy[0]),
          complete: point.complete,
          name: skeleton.nodes[nIdx]?.name ?? `node_${nIdx}`,
          score: "score" in point ? (point as unknown as { score: number }).score : undefined,
        }));

        const edges = edgeIndices.map(
          ([srcIdx, dstIdx]) =>
            ({ srcIdx, dstIdx }) as { srcIdx: number; dstIdx: number }
        );

        return {
          nodes,
          edges,
          color,
          nodeColors,
          edgeColors,
          isPredicted,
          isSelected: inst === selectedInstance,
          trackName: inst.track?.name ?? null,
          score: isPredicted ? (inst as unknown as { score: number }).score : undefined,
        };
      }
    );

    renderedInstancesRef.current = instances;

    // Apply fit-to-window base transform + user zoom/pan
    ctx.save();
    ctx.translate(offsetX + panX, offsetY + panY);
    ctx.scale(baseScale * zoom, baseScale * zoom);

    // Render motion trails before skeleton instances (behind)
    if (trailLength > 0 && labels && video) {
      renderTrails(
        ctx,
        labels,
        frameIdx,
        video,
        trailLength,
        labels.tracks,
        palette,
        zoom
      );
    }

    renderInstances(ctx, instances, {
      markerSize,
      nodeLabelSize,
      edgeStyle,
      showInstances,
      showLabels,
      showEdges,
      showNonVisibleNodes,
      colorPredicted,
      zoom: baseScale * zoom,
    });

    ctx.restore();
  }, [
    labeledFrame,
    selectedInstance,
    showInstances,
    showLabels,
    showEdges,
    showNonVisibleNodes,
    colorPredicted,
    edgeStyle,
    markerSize,
    nodeLabelSize,
    palette,
    distinctlyColor,
    trailLength,
    zoom,
    panX,
    panY,
    frameDims,
    containerSize,
    baseScale,
    offsetX,
    offsetY,
    overlayVersion,
    labels,
    video,
    frameIdx,
  ]);

  // Fit view to instances when 'fit' is enabled and frame changes
  useEffect(() => {
    if (!fit || !labeledFrame) return;
    const [cw, ch] = containerSize;
    if (cw === 0 || ch === 0) return;
    const [fw, fh] = frameDims;
    if (fw === 0 || fh === 0) return;

    const instances = renderedInstancesRef.current;
    const allNodes = instances.flatMap((inst) =>
      inst.nodes.filter((n) => n.visible)
    );
    if (allNodes.length === 0) return;

    const xs = allNodes.map((n) => n.x);
    const ys = allNodes.map((n) => n.y);
    const pad = 50;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;

    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    if (bboxW <= 0 || bboxH <= 0) return;

    // Zoom relative to baseScale so bbox fills the container
    const newZoom = Math.min(cw / (bboxW * baseScale), ch / (bboxH * baseScale), 10);

    // Center the bounding box
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const newPanX = cw / 2 - offsetX - centerX * baseScale * newZoom;
    const newPanY = ch / 2 - offsetY - centerY * baseScale * newZoom;

    viewRef.current = { zoom: newZoom, panX: newPanX, panY: newPanY };
    setZoom(newZoom);
    setPanX(newPanX);
    setPanY(newPanY);
  }, [fit, labeledFrame, frameDims, containerSize, baseScale, offsetX, offsetY]);

  // Mouse handlers for interaction
  const canvasToScene = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = overlayCanvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      return {
        x: (cx - offsetX - panX) / (baseScale * zoom),
        y: (cy - offsetY - panY) / (baseScale * zoom),
      };
    },
    [zoom, panX, panY, baseScale, offsetX, offsetY]
  );

  // Constrain pan so at least 25% of the video remains visible
  const constrainPan = useCallback(
    (px: number, py: number, z: number) => {
      const [cw, ch] = containerSize;
      const [fw, fh] = frameDims;
      if (fw === 0 || fh === 0) return { x: px, y: py };
      const scaledW = fw * baseScale * z;
      const scaledH = fh * baseScale * z;
      const minVisible = 0.25;
      const minVisibleX = scaledW * minVisible;
      const minVisibleY = scaledH * minVisible;
      const minPX = minVisibleX - scaledW - offsetX;
      const maxPX = cw - minVisibleX - offsetX;
      const minPY = minVisibleY - scaledH - offsetY;
      const maxPY = ch - minVisibleY - offsetY;
      return {
        x: Math.max(minPX, Math.min(maxPX, px)),
        y: Math.max(minPY, Math.min(maxPY, py)),
      };
    },
    [containerSize, frameDims, baseScale, offsetX, offsetY]
  );

  // Check if we're in node placement mode (selected instance has unplaced NaN nodes)
  const isPlacingNodes = selectedInstance
    ? selectedInstance.points.some((p) => isNaN(p.xy[0]) || isNaN(p.xy[1]))
    : false;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle-click panning
      if (e.button === 1) {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
        return;
      }

      if (e.button !== 0) return; // Only left-click for interaction

      // Alt+left-click panning
      if (e.altKey) {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
        return;
      }

      const { x, y } = canvasToScene(e.clientX, e.clientY);
      const currentInstance = useAppStore.getState().instance;

      // Node placement mode: place the next unplaced node (with undo snapshot)
      if (currentInstance && !("score" in currentInstance)) {
        const unplacedIdx = currentInstance.points.findIndex(
          (p) => isNaN(p.xy[0]) || isNaN(p.xy[1])
        );
        if (unplacedIdx !== -1) {
          // Take undo snapshot before placement
          commandContext.execute(BeginEdit);
          currentInstance.points[unplacedIdx].xy = [x, y];
          currentInstance.points[unplacedIdx].visible = true;
          currentInstance.points[unplacedIdx].complete = true;
          useAppStore.getState().markChanged();
          useAppStore.getState().bumpOverlayVersion();
          return;
        }
      }

      const instances = renderedInstancesRef.current;

      // Scale hit test thresholds by 1/zoom for consistent feel at all zoom levels
      const nodeThreshold = (markerSize * 2) / zoom;
      const instanceThreshold = 30 / zoom;

      // Try to hit a node first
      const nodeHit = hitTestNode(instances, x, y, nodeThreshold);
      if (nodeHit) {
        const lf = useAppStore.getState().labeledFrame;
        if (lf) {
          useAppStore.getState().setInstance(lf.instances[nodeHit.instanceIdx]);
        }

        // Start dragging if it's a user instance (not predicted)
        const inst = instances[nodeHit.instanceIdx];
        if (!inst.isPredicted) {
          // Take undo snapshot before drag starts
          commandContext.execute(BeginEdit);
          setDragNodeInfo(nodeHit);
          setIsDragging(true);
          lastDragPos.current = { x, y };
        }
        return;
      }

      // Try to hit an instance (by centroid)
      const instHit = hitTestInstance(instances, x, y, instanceThreshold);
      if (instHit !== null) {
        const lf = useAppStore.getState().labeledFrame;
        if (lf) {
          useAppStore.getState().setInstance(lf.instances[instHit]);
        }
        return;
      }

      // Click on empty space - deselect
      useAppStore.getState().setInstance(null);
    },
    [canvasToScene, markerSize, panX, panY, zoom]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Handle panning
      if (isPanning) {
        const rawPx = e.clientX - panStart.x;
        const rawPy = e.clientY - panStart.y;
        const constrained = constrainPan(rawPx, rawPy, zoom);
        viewRef.current.panX = constrained.x;
        viewRef.current.panY = constrained.y;
        setPanX(constrained.x);
        setPanY(constrained.y);
        return;
      }

      if (!isDragging || !dragNodeInfo) return;

      const { x, y } = canvasToScene(e.clientX, e.clientY);
      const lf = useAppStore.getState().labeledFrame;
      if (!lf) return;

      const instance = lf.instances[dragNodeInfo.instanceIdx];
      if (!instance) return;

      if (e.altKey) {
        // Alt+Drag: move the entire instance by delta
        const prev = lastDragPos.current;
        if (prev) {
          const dx = x - prev.x;
          const dy = y - prev.y;
          for (const point of instance.points) {
            if (!isNaN(point.xy[0]) && !isNaN(point.xy[1])) {
              point.xy = [point.xy[0] + dx, point.xy[1] + dy];
            }
          }
        }
        lastDragPos.current = { x, y };
      } else {
        // Normal drag: move single node
        const point = instance.points[dragNodeInfo.nodeIdx];
        if (point) {
          point.xy = [x, y];
          point.visible = true;
        }
        lastDragPos.current = { x, y };
      }

      useAppStore.getState().markChanged();
      useAppStore.getState().bumpOverlayVersion();
    },
    [isDragging, isPanning, dragNodeInfo, canvasToScene, panStart, constrainPan, zoom]
  );

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (isDragging) {
      setIsDragging(false);
      setDragNodeInfo(null);
      lastDragPos.current = null;
    }
  }, [isDragging, isPanning]);

  // Zoom with mouse wheel (towards pointer), Alt+Scroll for rotation
  // Use native event listener with { passive: false } so preventDefault() works
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Alt+Scroll: rotate selected instance
      if (e.altKey) {
        const currentInstance = useAppStore.getState().instance;
        if (currentInstance && !("score" in currentInstance)) {
          // Take undo snapshot on first rotation tick of a gesture
          if (!rotationSnapshotTaken.current) {
            commandContext.execute(BeginEdit);
            rotationSnapshotTaken.current = true;
          }

          const angle = (e.deltaY > 0 ? 5 : -5) * (Math.PI / 180); // 5 degrees per tick

          // Compute centroid
          const visible = currentInstance.points.filter(
            (p: { xy: number[] }) => !isNaN(p.xy[0]) && !isNaN(p.xy[1])
          );
          if (visible.length > 0) {
            const cx = visible.reduce((s: number, p: { xy: number[] }) => s + p.xy[0], 0) / visible.length;
            const cy = visible.reduce((s: number, p: { xy: number[] }) => s + p.xy[1], 0) / visible.length;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            for (const point of currentInstance.points) {
              if (isNaN(point.xy[0]) || isNaN(point.xy[1])) continue;
              const dx = point.xy[0] - cx;
              const dy = point.xy[1] - cy;
              point.xy = [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
            }

            useAppStore.getState().markChanged();
            useAppStore.getState().bumpOverlayVersion();
          }
        }
        return;
      }

      // Reset rotation snapshot tracking when not using alt
      rotationSnapshotTaken.current = false;

      // Normalize deltaY for different input devices
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 40; // line mode
      delta = Math.max(-100, Math.min(100, delta)); // Clamp
      const zoomFactor = Math.exp(-delta * 0.001);

      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Read latest zoom/pan from ref (avoids stale closures with rapid events)
      const prev = viewRef.current;
      const newZoom = Math.max(0.1, Math.min(50, prev.zoom * zoomFactor));
      const ratio = newZoom / prev.zoom;

      // Zoom towards cursor: keep the scene point under the cursor fixed
      const anchorX = mx - offsetX;
      const anchorY = my - offsetY;
      const newPanX = anchorX - (anchorX - prev.panX) * ratio;
      const newPanY = anchorY - (anchorY - prev.panY) * ratio;

      // Eagerly update ref so next wheel event (before React commits) sees latest values
      viewRef.current = { zoom: newZoom, panX: newPanX, panY: newPanY };

      // Update state for rendering (no nested setState, no constrainPan interference)
      setZoom(newZoom);
      setPanX(newPanX);
      setPanY(newPanY);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [offsetX, offsetY]);

  // Double-click: convert predicted instance, or reset zoom/pan
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const { x, y } = canvasToScene(e.clientX, e.clientY);
      const instances = renderedInstancesRef.current;

      // Scale hit test thresholds by 1/zoom
      const nodeThreshold = (markerSize * 2) / zoom;
      const instanceThreshold = 30 / zoom;

      // Check if double-clicking on a predicted instance (by node)
      const nodeHit = hitTestNode(instances, x, y, nodeThreshold);
      if (nodeHit && instances[nodeHit.instanceIdx]?.isPredicted) {
        commandContext.execute(ConvertPredictionToInstance, {
          instanceIdx: nodeHit.instanceIdx,
        });
        return;
      }

      // Check if double-clicking on a predicted instance (by centroid)
      const instHit = hitTestInstance(instances, x, y, instanceThreshold);
      if (instHit !== null && instances[instHit]?.isPredicted) {
        commandContext.execute(ConvertPredictionToInstance, {
          instanceIdx: instHit,
        });
        return;
      }

      // No prediction hit - reset zoom/pan
      viewRef.current = { zoom: 1, panX: 0, panY: 0 };
      setZoom(1);
      setPanX(0);
      setPanY(0);
    },
    [canvasToScene, markerSize, zoom]
  );

  // Right-click context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const { x, y } = canvasToScene(e.clientX, e.clientY);
      const instances = renderedInstancesRef.current;

      // Check if right-clicking on a node
      const nodeHit = hitTestNode(instances, x, y, markerSize * 2);
      if (nodeHit) {
        const lf = useAppStore.getState().labeledFrame;
        if (lf) {
          useAppStore.getState().setInstance(lf.instances[nodeHit.instanceIdx]);
        }
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          instanceIdx: nodeHit.instanceIdx,
          nodeIdx: nodeHit.nodeIdx,
        });
        return;
      }

      // Check if right-clicking on an instance
      const instHit = hitTestInstance(instances, x, y);
      if (instHit !== null) {
        const lf = useAppStore.getState().labeledFrame;
        if (lf) {
          useAppStore.getState().setInstance(lf.instances[instHit]);
        }
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          instanceIdx: instHit,
          nodeIdx: null,
        });
        return;
      }

      // Right-click on empty space
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        instanceIdx: null,
        nodeIdx: null,
      });
    },
    [canvasToScene, markerSize]
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Canvas container */}
      <div
        ref={containerRef}
        className={cn(
          "flex-1 relative overflow-hidden bg-background min-h-0",
          isPanning ? "cursor-grabbing" : isDragging ? "cursor-move" : isPlacingNodes ? "cursor-cell" : "cursor-crosshair"
        )}
        onDoubleClick={handleDoubleClick}
      >
        {/* Video frame layer */}
        <canvas
          ref={frameCanvasRef}
          className="absolute inset-0"
        />
        {/* Skeleton overlay layer */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
        />

        {/* Frame info overlay */}
        <Badge
          variant="secondary"
          className="absolute bottom-2 left-2 pointer-events-none rounded-md bg-black/60 text-white/80 border-none"
        >
          Frame {frameIdx}
          {video?.shape && ` / ${video.shape[0] - 1}`}
          {zoom !== 1 && ` | ${(zoom * 100).toFixed(0)}%`}
        </Badge>

        {/* Node placement indicator */}
        {isPlacingNodes && selectedInstance && (
          <Badge
            variant="default"
            className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none rounded-md"
          >
            Click to place: {
              selectedInstance.skeleton.nodes[
                selectedInstance.points.findIndex(
                  (p) => isNaN(p.xy[0]) || isNaN(p.xy[1])
                )
              ]?.name ?? "node"
            }
            {" "}({selectedInstance.points.filter((p) => !isNaN(p.xy[0])).length}/{selectedInstance.points.length})
          </Badge>
        )}

        {/* Missing video placeholder */}
        {video && isVideoMissing(video) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <div className="flex flex-col items-center gap-3 pointer-events-auto">
              <Film className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Video file not found</p>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const ok = await resolveVideoFile(video);
                  if (ok) {
                    useAppStore.getState().bumpOverlayVersion();
                    useAppStore.getState().setFrameIdx(frameIdx);
                  }
                }}
              >
                Locate Video
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Seekbar */}
      <Seekbar />

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          instanceIdx={contextMenu.instanceIdx}
          nodeIdx={contextMenu.nodeIdx}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
