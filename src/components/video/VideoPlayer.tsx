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
import { getPaletteColor } from "../../lib/colorPalettes";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

  // Local zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragNodeInfo, setDragNodeInfo] = useState<{
    instanceIdx: number;
    nodeIdx: number;
  } | null>(null);

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

  // Load and render the current frame
  useEffect(() => {
    if (!video || !video.backend) return;

    const canvas = frameCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;

    (async () => {
      try {
        const frame = await video.backend!.getFrame(frameIdx);
        if (cancelled || !frame) return;

        // Handle different frame types
        if (frame instanceof ImageBitmap) {
          canvas.width = frame.width;
          canvas.height = frame.height;
          ctx.drawImage(frame, 0, 0);
        } else if (frame instanceof ImageData) {
          canvas.width = frame.width;
          canvas.height = frame.height;
          ctx.putImageData(frame, 0, 0);
        } else if (frame instanceof ArrayBuffer || frame instanceof Uint8Array) {
          const bytes =
            frame instanceof ArrayBuffer ? new Uint8Array(frame) : frame;
          const shape = video.shape;
          if (shape) {
            const [, h, w] = shape;
            canvas.width = w;
            canvas.height = h;
            const imageData = new ImageData(
              new Uint8ClampedArray(bytes),
              w,
              h
            );
            ctx.putImageData(imageData, 0, 0);
          }
        }

        // Signal that frame canvas dimensions changed
        if (!cancelled) {
          setFrameDims([canvas.width, canvas.height]);
        }
      } catch (err) {
        console.error("Failed to render frame:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [video, frameIdx]);

  // Find the current labeled frame and update store
  useEffect(() => {
    if (!labels || !video) {
      useAppStore.getState().setLabeledFrame(null);
      return;
    }

    const frames = labels.find({ video, frameIdx });
    const lf = frames.length > 0 ? frames[0] : null;
    useAppStore.getState().setLabeledFrame(lf);
  }, [labels, video, frameIdx]);

  // Render skeleton overlay
  const labeledFrame = useAppStore((s) => s.labeledFrame);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    // Use tracked frame dimensions
    const [fw, fh] = frameDims;
    if (fw === 0 || fh === 0) return;

    canvas.width = fw;
    canvas.height = fh;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!labeledFrame || !showInstances) {
      renderedInstancesRef.current = [];
      return;
    }

    // Build renderable instances
    const instances: RenderedInstance[] = labeledFrame.instances.map(
      (inst, idx) => {
        const isPredicted = "score" in inst;
        const skeleton = inst.skeleton;
        const color: [number, number, number] =
          isPredicted && !colorPredicted
            ? [128, 128, 128] // Gray for predicted when colorPredicted is off
            : getPaletteColor(palette, idx);

        const nodes: RenderedNode[] = inst.points.map((point, nIdx) => ({
          x: point.xy[0],
          y: point.xy[1],
          visible: point.visible && !isNaN(point.xy[0]),
          complete: point.complete,
          name: skeleton.nodes[nIdx]?.name ?? `node_${nIdx}`,
          score: "score" in point ? (point as unknown as { score: number }).score : undefined,
        }));

        const edges = skeleton.edgeIndices.map(
          ([srcIdx, dstIdx]) =>
            ({ srcIdx, dstIdx }) as { srcIdx: number; dstIdx: number }
        );

        return {
          nodes,
          edges,
          color,
          isPredicted,
          isSelected: inst === selectedInstance,
          trackName: inst.track?.name ?? null,
          score: isPredicted ? (inst as unknown as { score: number }).score : undefined,
        };
      }
    );

    renderedInstancesRef.current = instances;

    // Apply zoom/pan transform
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    renderInstances(ctx, instances, {
      markerSize,
      nodeLabelSize,
      edgeStyle,
      showInstances,
      showLabels,
      showEdges,
      showNonVisibleNodes,
      colorPredicted,
      zoom,
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
    zoom,
    panX,
    panY,
    frameDims,
  ]);

  // Fit view to instances when 'fit' is enabled and frame changes
  useEffect(() => {
    if (!fit || !labeledFrame) return;
    const container = containerRef.current;
    if (!container) return;
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

    const rect = container.getBoundingClientRect();
    const scaleX = rect.width / bboxW;
    const scaleY = rect.height / bboxH;
    const newZoom = Math.min(scaleX, scaleY, 10);

    // Center the bounding box
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const newPanX = rect.width / 2 - centerX * newZoom;
    const newPanY = rect.height / 2 - centerY * newZoom;

    setZoom(newZoom);
    setPanX(newPanX);
    setPanY(newPanY);
  }, [fit, labeledFrame, frameDims]);

  // Mouse handlers for interaction
  const canvasToScene = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = overlayCanvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: ((clientX - rect.left) * scaleX - panX) / zoom,
        y: ((clientY - rect.top) * scaleY - panY) / zoom,
      };
    },
    [zoom, panX, panY]
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

      const { x, y } = canvasToScene(e.clientX, e.clientY);
      const currentInstance = useAppStore.getState().instance;

      // Node placement mode: place the next unplaced node
      if (currentInstance && !("score" in currentInstance)) {
        const unplacedIdx = currentInstance.points.findIndex(
          (p) => isNaN(p.xy[0]) || isNaN(p.xy[1])
        );
        if (unplacedIdx !== -1) {
          currentInstance.points[unplacedIdx].xy = [x, y];
          currentInstance.points[unplacedIdx].visible = true;
          currentInstance.points[unplacedIdx].complete = true;
          useAppStore.getState().markChanged();
          // Force re-render
          useAppStore
            .getState()
            .setLabeledFrame(useAppStore.getState().labeledFrame);
          return;
        }
      }

      const instances = renderedInstancesRef.current;

      // Try to hit a node first
      const nodeHit = hitTestNode(instances, x, y, markerSize * 2);
      if (nodeHit) {
        const lf = useAppStore.getState().labeledFrame;
        if (lf) {
          useAppStore.getState().setInstance(lf.instances[nodeHit.instanceIdx]);
        }

        // Start dragging if it's a user instance (not predicted)
        const inst = instances[nodeHit.instanceIdx];
        if (!inst.isPredicted) {
          setDragNodeInfo(nodeHit);
          setIsDragging(true);
        }
        return;
      }

      // Try to hit an instance (by centroid)
      const instHit = hitTestInstance(instances, x, y);
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
    [canvasToScene, markerSize, panX, panY]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Handle panning
      if (isPanning) {
        setPanX(e.clientX - panStart.x);
        setPanY(e.clientY - panStart.y);
        return;
      }

      if (!isDragging || !dragNodeInfo) return;

      const { x, y } = canvasToScene(e.clientX, e.clientY);
      const lf = useAppStore.getState().labeledFrame;
      if (!lf) return;

      const instance = lf.instances[dragNodeInfo.instanceIdx];
      if (!instance) return;

      // Update point position directly (mutable data model)
      const point = instance.points[dragNodeInfo.nodeIdx];
      if (point) {
        point.xy = [x, y];
        point.visible = true;
        useAppStore.getState().markChanged();
        // Force overlay re-render via labeledFrame reference update
        useAppStore
          .getState()
          .setLabeledFrame(useAppStore.getState().labeledFrame);
      }
    },
    [isDragging, isPanning, dragNodeInfo, canvasToScene, panStart]
  );

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (isDragging) {
      setIsDragging(false);
      setDragNodeInfo(null);
    }
  }, [isDragging, isPanning]);

  // Zoom with mouse wheel (towards pointer)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const canvas = overlayCanvasRef.current;
      if (!canvas) {
        setZoom((z) => Math.max(0.1, Math.min(20, z * factor)));
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      // Mouse position in canvas pixel coords
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      setZoom((prevZoom) => {
        const newZoom = Math.max(0.1, Math.min(20, prevZoom * factor));
        // Adjust pan to keep the point under the cursor stationary
        setPanX((px) => mx - (mx - px) * (newZoom / prevZoom));
        setPanY((py) => my - (my - py) * (newZoom / prevZoom));
        return newZoom;
      });
    },
    []
  );

  // Double-click to reset zoom/pan
  const handleDoubleClick = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

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
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      >
        {/* Video frame layer */}
        <canvas
          ref={frameCanvasRef}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ imageRendering: zoom > 2 ? "pixelated" : "auto" }}
        />
        {/* Skeleton overlay layer */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full object-contain"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
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
