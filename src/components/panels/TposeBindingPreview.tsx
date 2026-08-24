/** Presentational T-Pose binding inspector used by Motion Rig. */

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bone,
  CircleDot,
  Eye,
  EyeOff,
  Layers3,
  ScanLine,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MotionRigEdge, MotionRigPoint } from "@/lib/motionRigReview";

export interface TposeBindingViewAnchor {
  node: string;
  /** Coordinates in cropped-part pixels, measured from its top-left. */
  local: readonly [number, number];
}

export interface TposeBindingViewPart {
  id: string;
  name?: string;
  rect: readonly [number, number, number, number];
  pivot: readonly [number, number];
  anchors: readonly TposeBindingViewAnchor[];
  bone?: string;
  slot: string;
  z: number;
  visible?: boolean;
}

export interface TposeBindingViewManifest {
  atlas: { file: string; width: number; height: number };
  parts: readonly TposeBindingViewPart[];
}

export interface TposeBindingViewSolution {
  id: string;
  name?: string;
  bone?: string;
  slot: string;
  z: number;
  sourceRect: readonly [number, number, number, number];
  pivot: readonly [number, number];
  visible: boolean;
  status: string;
  transform: {
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    matrix: { a: number; b: number; c: number; d: number; tx: number; ty: number };
  };
  rmse: number | null;
  maxError: number | null;
  usedAnchorCount: number;
}

export interface TposeBindingPreviewProps {
  manifest: TposeBindingViewManifest;
  solutions: readonly TposeBindingViewSolution[];
  atlasUrl: string;
  frameIdx: number;
  frameWidth: number;
  frameHeight: number;
  points: Record<string, MotionRigPoint>;
  edges: readonly MotionRigEdge[];
}

interface AnchorOverlay {
  key: string;
  node: string;
  targetX: number;
  targetY: number;
  solvedX: number;
  solvedY: number;
  error: number;
}

function finitePoint(point: MotionRigPoint | undefined): point is MotionRigPoint {
  return !!point && point.visible && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function matrixString(solution: TposeBindingViewSolution): string {
  const { a, b, c, d, tx, ty } = solution.transform.matrix;
  return `matrix(${a} ${b} ${c} ${d} ${tx} ${ty})`;
}

function statusVariant(status: string): "secondary" | "outline" | "destructive" {
  if (status === "solved" || status === "ok") return "secondary";
  if (status === "unresolved" || status === "hidden") return "destructive";
  return "outline";
}

/**
 * UI-only preview. Loading/parsing/solving is intentionally kept in the thin
 * container so this component can be tested without network or model setup.
 */
export function TposeBindingPreview({
  manifest,
  solutions,
  atlasUrl,
  frameIdx,
  frameWidth,
  frameHeight,
  points,
  edges,
}: TposeBindingPreviewProps) {
  const [selectedPartId, setSelectedPartId] = useState<string | null>(
    manifest.parts[0]?.id ?? null,
  );
  const [hiddenParts, setHiddenParts] = useState<Set<string>>(new Set());
  const [showBinding, setShowBinding] = useState(true);
  const [showOverlays, setShowOverlays] = useState(true);
  const [showBones, setShowBones] = useState(true);
  const [showAnchors, setShowAnchors] = useState(true);
  const [showErrors, setShowErrors] = useState(true);
  const [atlasFailed, setAtlasFailed] = useState(false);

  useEffect(() => {
    if (!manifest.parts.some((part) => part.id === selectedPartId)) {
      setSelectedPartId(manifest.parts[0]?.id ?? null);
    }
  }, [manifest, selectedPartId]);

  useEffect(() => setHiddenParts(new Set()), [manifest]);
  useEffect(() => setAtlasFailed(false), [atlasUrl]);

  const partsById = useMemo(
    () => new Map(manifest.parts.map((part) => [part.id, part])),
    [manifest.parts],
  );
  const selectedPart = selectedPartId ? partsById.get(selectedPartId) : undefined;
  const visibleSolutions = useMemo(
    () =>
      solutions
        .filter(
          (solution) =>
            solution.visible && !hiddenParts.has(solution.id),
        )
        .sort(
          (a, b) =>
            a.z - b.z || stableCompare(a.slot, b.slot) || stableCompare(a.id, b.id),
        ),
    [solutions, hiddenParts],
  );

  const anchorOverlays = useMemo<AnchorOverlay[]>(() => {
    if (!selectedPartId) return [];
    const part = partsById.get(selectedPartId);
    const solution = solutions.find((candidate) => candidate.id === selectedPartId);
    if (
      !part ||
      !solution ||
      !solution.visible ||
      hiddenParts.has(solution.id)
    ) return [];
    const { a, b, c, d, tx, ty } = solution.transform.matrix;
    return part.anchors.flatMap((anchor, index) => {
      const target = points[anchor.node];
      if (!finitePoint(target)) return [];
      const solvedX = a * anchor.local[0] + c * anchor.local[1] + tx;
      const solvedY = b * anchor.local[0] + d * anchor.local[1] + ty;
      return [{
        key: `${part.id}:${anchor.node}:${index}`,
        node: anchor.node,
        targetX: target.x,
        targetY: target.y,
        solvedX,
        solvedY,
        error: Math.hypot(solvedX - target.x, solvedY - target.y),
      }];
    });
  }, [hiddenParts, partsById, points, selectedPartId, solutions]);

  const togglePart = (partId: string) => {
    setHiddenParts((current) => {
      const next = new Set(current);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  };

  const width = Number.isFinite(frameWidth) && frameWidth > 0 ? frameWidth : 1;
  const height = Number.isFinite(frameHeight) && frameHeight > 0 ? frameHeight : 1;

  return (
    <div className="space-y-3" data-testid="tpose-binding-preview">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant={showBinding ? "secondary" : "ghost"}
          size="xs"
          aria-pressed={showBinding}
          aria-label="Toggle all bound parts"
          onClick={() => setShowBinding((value) => !value)}
        >
          {showBinding ? <Eye /> : <EyeOff />}
          Binding
        </Button>
        <Button
          variant={showOverlays ? "secondary" : "ghost"}
          size="xs"
          aria-pressed={showOverlays}
          aria-label="Toggle all binding overlays"
          disabled={!showBinding}
          onClick={() => setShowOverlays((value) => !value)}
        >
          <ScanLine />
          Overlays
        </Button>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
          Frame {frameIdx}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1">
        <Button
          variant={showBones ? "secondary" : "ghost"}
          size="xs"
          aria-pressed={showBones}
          disabled={!showBinding || !showOverlays}
          onClick={() => setShowBones((value) => !value)}
        >
          <Bone /> Bones
        </Button>
        <Button
          variant={showAnchors ? "secondary" : "ghost"}
          size="xs"
          aria-pressed={showAnchors}
          disabled={!showBinding || !showOverlays}
          onClick={() => setShowAnchors((value) => !value)}
        >
          <CircleDot /> Anchors
        </Button>
        <Button
          variant={showErrors ? "secondary" : "ghost"}
          size="xs"
          aria-pressed={showErrors}
          disabled={!showBinding || !showOverlays}
          onClick={() => setShowErrors((value) => !value)}
        >
          <AlertCircle /> Errors
        </Button>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium">Source T-Pose parts</span>
          <span className="text-muted-foreground">{manifest.parts.length} mapped</span>
        </div>
        <div className="overflow-hidden rounded-md border border-border bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:12px_12px]">
          <svg
            viewBox={`0 0 ${manifest.atlas.width} ${manifest.atlas.height}`}
            className="block max-h-48 w-full"
            role="img"
            aria-label="Source T-Pose component atlas"
            data-testid="tpose-binding-source-atlas"
          >
            <image
              href={atlasUrl}
              x="0"
              y="0"
              width={manifest.atlas.width}
              height={manifest.atlas.height}
              onError={() => setAtlasFailed(true)}
              onLoad={() => setAtlasFailed(false)}
            />
            {selectedPart && (
              <rect
                x={selectedPart.rect[0]}
                y={selectedPart.rect[1]}
                width={selectedPart.rect[2]}
                height={selectedPart.rect[3]}
                fill="rgb(56 189 248 / 0.12)"
                stroke="rgb(56 189 248)"
                strokeWidth={Math.max(2, manifest.atlas.width / 256)}
                vectorEffect="non-scaling-stroke"
                data-testid="tpose-binding-source-selection"
              />
            )}
          </svg>
        </div>
        {atlasFailed && (
          <div
            className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[10px] text-amber-300"
            role="alert"
            data-testid="tpose-binding-atlas-error"
          >
            T-Pose atlas could not be loaded. Component transforms remain available,
            but the image preview is blank.
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium">Components</span>
          <span className="text-muted-foreground">
            {visibleSolutions.length}/{manifest.parts.length} visible
          </span>
        </div>
        <div
          className="max-h-52 overflow-auto rounded-md border border-border"
          data-testid="tpose-binding-component-list"
        >
          {[...manifest.parts]
            .sort((a, b) => b.z - a.z || stableCompare(a.id, b.id))
            .map((part) => {
              const hidden = hiddenParts.has(part.id);
              const solution = solutions.find((candidate) => candidate.id === part.id);
              const unavailable = !solution || !solution.visible;
              const effectivelyHidden = hidden || unavailable;
              return (
                <div
                  key={part.id}
                  className={cn(
                    "flex items-center gap-1.5 border-b border-border/60 px-1.5 py-1 last:border-b-0",
                    selectedPartId === part.id && "bg-accent",
                    effectivelyHidden && "opacity-50",
                  )}
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={unavailable
                      ? `${part.name ?? part.id} unavailable`
                      : `${hidden ? "Show" : "Hide"} ${part.name ?? part.id}`}
                    aria-pressed={!effectivelyHidden}
                    disabled={unavailable}
                    onClick={() => togglePart(part.id)}
                  >
                    {effectivelyHidden ? <EyeOff /> : <Eye />}
                  </Button>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/60"
                    aria-pressed={selectedPartId === part.id}
                    onClick={() => setSelectedPartId(part.id)}
                  >
                    <svg
                      viewBox={`${part.rect[0]} ${part.rect[1]} ${part.rect[2]} ${part.rect[3]}`}
                      className="h-8 w-8 shrink-0 rounded border border-border bg-black/10"
                      aria-hidden="true"
                    >
                      <image
                        href={atlasUrl}
                        x="0"
                        y="0"
                        width={manifest.atlas.width}
                        height={manifest.atlas.height}
                      />
                    </svg>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium">
                        {part.name ?? part.id}
                      </span>
                      <span className="block truncate text-[9px] text-muted-foreground">
                        bone {part.bone ?? "unmapped"} · slot {part.slot} · z {part.z}
                      </span>
                    </span>
                  </button>
                  {solution && (
                    <Badge
                      variant={statusVariant(solution.status)}
                      className="max-w-16 px-1 text-[8px]"
                      title={`${solution.usedAnchorCount} anchors`}
                    >
                      {solution.status}
                    </Badge>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium">Bound character preview</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Layers3 className="h-3 w-3" /> {visibleSolutions.length} layers
          </span>
        </div>
        <div className="relative overflow-hidden rounded-md border border-border bg-slate-950">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="block w-full"
            style={{ aspectRatio: `${width} / ${height}` }}
            role="img"
            aria-label={`Bound T-Pose character at frame ${frameIdx}`}
            data-testid="tpose-binding-output"
          >
            <defs>
              <pattern id="motion-rig-binding-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgb(71 85 105 / 0.35)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={width} height={height} fill="url(#motion-rig-binding-grid)" />

            {showBinding && visibleSolutions.map((solution) => {
              const [rectX, rectY, rectWidth, rectHeight] = solution.sourceRect;
              const selected = solution.id === selectedPartId;
              return (
                <g
                  key={solution.id}
                  transform={matrixString(solution)}
                  data-part-id={solution.id}
                  data-testid={`tpose-bound-part-${solution.id}`}
                >
                  <svg
                    x="0"
                    y="0"
                    width={rectWidth}
                    height={rectHeight}
                    viewBox={`${rectX} ${rectY} ${rectWidth} ${rectHeight}`}
                    overflow="hidden"
                  >
                    <image
                      href={atlasUrl}
                      x="0"
                      y="0"
                      width={manifest.atlas.width}
                      height={manifest.atlas.height}
                    />
                  </svg>
                  {selected && (
                    <rect
                      x="0"
                      y="0"
                      width={rectWidth}
                      height={rectHeight}
                      fill="none"
                      stroke="rgb(56 189 248)"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              );
            })}

            {showBinding && showOverlays && showBones && edges.map((edge) => {
              const source = points[edge.source];
              const destination = points[edge.destination];
              if (!finitePoint(source) || !finitePoint(destination)) return null;
              return (
                <line
                  key={`${edge.source}:${edge.destination}`}
                  x1={source.x}
                  y1={source.y}
                  x2={destination.x}
                  y2={destination.y}
                  stroke="rgb(34 211 238 / 0.9)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  data-testid="tpose-binding-bone"
                />
              );
            })}

            {showBinding && showOverlays && showAnchors && anchorOverlays.map((anchor) => (
              <g key={anchor.key} data-testid="tpose-binding-anchor">
                <line
                  x1={anchor.solvedX}
                  y1={anchor.solvedY}
                  x2={anchor.targetX}
                  y2={anchor.targetY}
                  stroke="rgb(248 113 113 / 0.9)"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={anchor.solvedX} cy={anchor.solvedY} r="4" fill="rgb(250 204 21)" />
                <circle
                  cx={anchor.targetX}
                  cy={anchor.targetY}
                  r="5"
                  fill="none"
                  stroke="rgb(34 211 238)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <title>{`${anchor.node}: ${anchor.error.toFixed(2)} px`}</title>
              </g>
            ))}

            {showBinding && showOverlays && showErrors && visibleSolutions.map((solution) => {
              if (solution.rmse === null || !Number.isFinite(solution.rmse)) return null;
              return (
                <g key={`error:${solution.id}`} data-testid="tpose-binding-error">
                  <rect
                    x={solution.transform.x + 5}
                    y={solution.transform.y - 16}
                    width="54"
                    height="14"
                    rx="3"
                    fill="rgb(15 23 42 / 0.85)"
                  />
                  <text
                    x={solution.transform.x + 9}
                    y={solution.transform.y - 6}
                    fill={solution.rmse > 8 ? "rgb(248 113 113)" : "rgb(226 232 240)"}
                    fontSize="9"
                  >
                    {`err ${solution.rmse.toFixed(1)}px`}
                  </text>
                </g>
              );
            })}
          </svg>

          {!showBinding && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-[11px] text-muted-foreground">
              Binding preview hidden
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
          <span><span className="text-cyan-400">—</span> skeleton</span>
          <span><span className="text-yellow-400">●</span> solved anchor</span>
          <span><span className="text-cyan-400">○</span> target point</span>
          <span><span className="text-red-400">┄</span> error</span>
        </div>
      </div>
    </div>
  );
}
