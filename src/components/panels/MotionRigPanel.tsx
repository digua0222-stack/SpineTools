/**
 * Motion Rig review panel.
 *
 * This is intentionally a focused correction surface, not a replacement for
 * Spine Editor. It turns the current SLEAP pose sequence into a ranked review
 * queue, records points that a downstream AI pass must not overwrite, and
 * checks the constraints that matter for a weapon animation.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  Clipboard,
  Crosshair,
  Lock,
  Unlock,
} from "lucide-react";

import { useAppStore } from "@/stores/appStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  analyzeMotionRigSequence,
  buildMotionRigFrames,
  buildMotionRigReviewManifest,
  emptyMotionRigReviewState,
  motionRigPointLockKey,
  nextMotionRigReviewFrame,
  parseMotionRigReviewState,
  setMotionRigFrameNote,
  setMotionRigPointLocked,
  type MotionRigEdge,
  type MotionRigIssue,
  type MotionRigReviewState,
  type MotionRigRoleMap,
} from "@/lib/motionRigReview";

const baseUrl = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;
const DEFAULT_TPOSE_URL = `${baseUrl}demo/zhaoyun/tpose_parts.png`;

const ISSUE_LABELS: Record<MotionRigIssue["type"], string> = {
  "missing-point": "Missing",
  "low-confidence": "Low confidence",
  "bone-length": "Bone length",
  "grip-distance": "Grip contact",
};

function videoIdentifier(filename: string | string[] | undefined): string {
  if (Array.isArray(filename)) return filename.join("|") || "untitled-video";
  return filename || "untitled-video";
}

function reviewStorageKey(videoId: string): string {
  return `motion-rig-review:v1:${videoId}`;
}

function roleEntries(roles: MotionRigRoleMap): Array<[string, string]> {
  const labels: Record<keyof MotionRigRoleMap, string> = {
    leftHand: "Left hand",
    rightHand: "Right hand",
    frontHand: "Front hand",
    rearHand: "Rear hand",
    weaponTip: "Weapon tip",
    weaponTail: "Weapon tail",
    frontGrip: "Front grip",
    rearGrip: "Rear grip",
  };
  return (Object.entries(roles) as Array<[keyof MotionRigRoleMap, string]>)
    .filter((entry): entry is [keyof MotionRigRoleMap, string] => !!entry[1])
    .map(([role, node]) => [labels[role], node]);
}

function issueColor(issue: MotionRigIssue): string {
  if (issue.locked) return "text-blue-400";
  if (issue.severity >= 0.75) return "text-red-400";
  return "text-amber-400";
}

export function MotionRigPanel() {
  const labels = useAppStore((state) => state.labels);
  const video = useAppStore((state) => state.video);
  const frameIdx = useAppStore((state) => state.frameIdx);
  const skeleton = useAppStore((state) => state.skeleton);
  const currentInstance = useAppStore((state) => state.instance);
  const setFrameIdx = useAppStore((state) => state.setFrameIdx);
  // Coordinates and scores mutate in-place, so use the edit sequence as the
  // explicit invalidation signal for the memoized review.
  const editSeq = useAppStore((state) => state.editSeq);

  const [confidenceThreshold, setConfidenceThreshold] = useState(0.55);
  const [boneLengthTolerance, setBoneLengthTolerance] = useState(0.2);
  const [reviewState, setReviewState] = useState<MotionRigReviewState>(
    emptyMotionRigReviewState,
  );
  const [referenceFailed, setReferenceFailed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [rememberedTrack, setRememberedTrack] = useState<{
    videoId: string;
    name: string | null;
  } | null>(null);

  const videoId = videoIdentifier(video?.filename);
  const configuredReferenceUrl = video?.backendMetadata.motionRigReferenceUrl;
  const referenceUrl =
    typeof configuredReferenceUrl === "string" && configuredReferenceUrl
      ? configuredReferenceUrl
      : videoId.includes("demo/zhaoyun/zhaoyun.mp4")
        ? DEFAULT_TPOSE_URL
        : null;
  const storageKey = reviewStorageKey(videoId);
  const nodeNames = useMemo(
    () => {
      // Commands mutate skeleton nodes in place; editSeq invalidates this copy.
      void editSeq;
      return skeleton?.nodes.map((node) => node.name) ?? [];
    },
    [skeleton, editSeq],
  );
  const edges = useMemo<MotionRigEdge[]>(
    () => {
      void editSeq;
      return skeleton?.edges.map((edge) => ({
        source: edge.source.name,
        destination: edge.destination.name,
      })) ?? [];
    },
    [skeleton, editSeq],
  );
  const labeledFramesForVideo = useMemo(
    () => {
      // Point edits also happen in place on labels/labeled frames.
      void editSeq;
      return labels && video ? labels.find({ video }) : [];
    },
    [labels, video, editSeq],
  );
  const currentTrackName = currentInstance?.track?.name ?? null;
  const fallbackTrackName = useMemo(() => {
    for (const labeledFrame of labeledFramesForVideo) {
      const tracked = labeledFrame.instances.find((instance) => instance.track?.name);
      if (tracked?.track?.name) return tracked.track.name;
    }
    return null;
  }, [labeledFramesForVideo]);
  const rememberedTrackName =
    rememberedTrack?.videoId === videoId ? rememberedTrack.name : undefined;
  const trackName = currentInstance
    ? currentTrackName
    : rememberedTrackName === undefined
      ? fallbackTrackName
      : rememberedTrackName;

  // Frame navigation clears the selected instance. Remember the last explicit
  // track selection per video so lock keys and review scope remain stable.
  useEffect(() => {
    if (currentInstance) setRememberedTrack({ videoId, name: currentTrackName });
  }, [currentInstance, currentTrackName, videoId]);

  useEffect(() => {
    if (!video) {
      setReviewState(emptyMotionRigReviewState());
      return;
    }
    try {
      setReviewState(parseMotionRigReviewState(localStorage.getItem(storageKey)));
    } catch {
      setReviewState(emptyMotionRigReviewState());
    }
  }, [storageKey, video]);

  useEffect(() => setReferenceFailed(false), [referenceUrl]);

  const persistReview = (
    update: (current: MotionRigReviewState) => MotionRigReviewState,
  ) => {
    setReviewState((current) => {
      const next = update(current);
      if (video) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Review still works in memory when storage is unavailable.
        }
      }
      return next;
    });
  };

  const motionFrames = useMemo(() => {
    void editSeq;
    if (nodeNames.length === 0) return [];
    return buildMotionRigFrames(labeledFramesForVideo, nodeNames, trackName);
  }, [labeledFramesForVideo, nodeNames, trackName, editSeq]);

  const lockedPoints = useMemo(
    () => new Set(reviewState.lockedPoints),
    [reviewState.lockedPoints],
  );
  const report = useMemo(
    () =>
      analyzeMotionRigSequence(motionFrames, edges, {
        confidenceThreshold,
        boneLengthTolerance,
        lockedPointKeys: lockedPoints,
        trackName,
      }),
    [motionFrames, edges, confidenceThreshold, boneLengthTolerance, lockedPoints, trackName],
  );
  const currentFrame = motionFrames.find((frame) => frame.frameIdx === frameIdx);
  const currentReport = report.frames.find((frame) => frame.frameIdx === frameIdx);
  const nextIssueFrame = nextMotionRigReviewFrame(report, frameIdx);
  const detectedRoles = roleEntries(report.roles);
  const hasHands =
    Number(!!report.roles.frontHand) +
      Number(!!report.roles.rearHand) +
      Number(!!report.roles.leftHand) +
      Number(!!report.roles.rightHand) >=
    2;
  const hasWeaponLine = !!report.roles.weaponTip && !!report.roles.weaponTail;
  const hasGrips = !!report.roles.frontGrip && !!report.roles.rearGrip;

  const togglePointLock = (nodeName: string) => {
    const key = motionRigPointLockKey(frameIdx, nodeName, trackName);
    persistReview((current) =>
      setMotionRigPointLocked(current, key, !current.lockedPoints.includes(key)),
    );
  };

  const copyReviewManifest = async () => {
    const manifest = buildMotionRigReviewManifest({
      videoId,
      trackName,
      nodeNames,
      edges,
      confidenceThreshold,
      boneLengthTolerance,
      roles: report.roles,
      review: reviewState,
    });
    try {
      await navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    window.setTimeout(() => setCopyStatus("idle"), 1600);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="motion-rig-panel">
      <div className="flex-1 min-h-0 overflow-auto">
        <details className="group border-b border-border/70" open>
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">
            Reference / T-Pose
          </summary>
          <div
            className="space-y-2 px-3 pb-3"
            data-testid="motion-rig-tpose-reference"
          >
            {referenceUrl && !referenceFailed ? (
              <div className="overflow-hidden rounded-md border border-border bg-black/20">
                <img
                  src={referenceUrl}
                  alt="Motion Rig T-Pose reference"
                  className="mx-auto max-h-52 w-full object-contain"
                  data-testid="motion-rig-tpose"
                  onError={() => setReferenceFailed(true)}
                  onLoad={() => setReferenceFailed(false)}
                />
              </div>
            ) : (
              <p className="rounded border border-dashed border-border p-2 text-[11px] text-muted-foreground">
                {referenceUrl
                  ? "T-Pose reference is unavailable. Pose review remains active."
                  : "No T-Pose reference is attached. Pose review remains active."}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Coordinate space: image pixels (origin: top-left)
            </p>
          </div>
        </details>

        {!labels || !video ? (
          <div className="p-3 text-xs text-muted-foreground">
            Open a pose project to review Motion Rig constraints.
          </div>
        ) : !skeleton || nodeNames.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">
            Add skeleton nodes before running Motion Rig review.
          </div>
        ) : (
          <>
            <section className="space-y-3 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Activity className="h-3.5 w-3.5" />
                  Review queue
                </div>
                <Badge
                  variant={report.queue.length > 0 ? "destructive" : "secondary"}
                  className="text-[10px]"
                >
                  {report.queue.length} frame{report.queue.length === 1 ? "" : "s"}
                </Badge>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <label htmlFor="motion-rig-confidence">Confidence threshold</label>
                  <span className="tabular-nums text-muted-foreground">
                    {confidenceThreshold.toFixed(2)}
                  </span>
                </div>
                <Slider
                  id="motion-rig-confidence"
                  aria-label="Confidence threshold"
                  min={0}
                  max={1}
                  step={0.05}
                  value={[confidenceThreshold]}
                  onValueChange={(values) =>
                    setConfidenceThreshold(values[0] ?? confidenceThreshold)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <label htmlFor="motion-rig-bone-tolerance">Bone length tolerance</label>
                  <span className="tabular-nums text-muted-foreground">
                    {(boneLengthTolerance * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  id="motion-rig-bone-tolerance"
                  aria-label="Bone length tolerance"
                  min={0.05}
                  max={0.5}
                  step={0.05}
                  value={[boneLengthTolerance]}
                  onValueChange={(values) =>
                    setBoneLengthTolerance(values[0] ?? boneLengthTolerance)
                  }
                />
              </div>

              <Button
                variant="subtle"
                size="xs"
                className="w-full"
                disabled={nextIssueFrame === null}
                onClick={() => nextIssueFrame !== null && setFrameIdx(nextIssueFrame)}
              >
                <Crosshair />
                Next issue
                {nextIssueFrame !== null && (
                  <span className="ml-auto tabular-nums">Frame {nextIssueFrame}</span>
                )}
              </Button>

              {report.queue.length === 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/5 p-2 text-[11px] text-green-400">
                  <Check className="h-3.5 w-3.5" />
                  No actionable anomalies at current thresholds.
                </div>
              ) : (
                <div className="max-h-36 space-y-1 overflow-auto" data-testid="motion-rig-review-queue">
                  {report.queue.slice(0, 20).map((frame) => (
                    <button
                      key={frame.frameIdx}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] hover:bg-accent",
                        frame.frameIdx === frameIdx && "bg-accent",
                      )}
                      onClick={() => setFrameIdx(frame.frameIdx)}
                    >
                      <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
                      <span className="font-medium tabular-nums">Frame {frame.frameIdx}</span>
                      <span className="ml-auto text-muted-foreground">
                        {frame.actionableIssues.length} issue
                        {frame.actionableIssues.length === 1 ? "" : "s"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            <section className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium">Current frame</h3>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  Frame {frameIdx}
                </span>
              </div>

              {!currentFrame ? (
                <p className="rounded border border-dashed border-border p-2 text-[11px] text-muted-foreground">
                  No pose instance on this frame. Run prediction or add an instance.
                </p>
              ) : (
                <>
                  <div className="space-y-1" data-testid="motion-rig-current-issues">
                    {(currentReport?.issues.length ?? 0) === 0 ? (
                      <p className="text-[11px] text-green-400">Frame passes current checks.</p>
                    ) : (
                      currentReport?.issues.map((issue) => (
                        <div
                          key={issue.id}
                          className="flex items-start gap-2 rounded bg-muted/30 px-2 py-1.5 text-[10px]"
                        >
                          <span className={cn("mt-0.5 font-medium", issueColor(issue))}>
                            {ISSUE_LABELS[issue.type]}
                          </span>
                          <span className="min-w-0 flex-1 text-muted-foreground">
                            {issue.message}
                          </span>
                          {issue.locked && <Lock className="h-3 w-3 shrink-0 text-blue-400" />}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="max-h-48 overflow-auto rounded-md border border-border">
                    {nodeNames.map((nodeName) => {
                      const point = currentFrame.points[nodeName];
                      const lockKey = motionRigPointLockKey(frameIdx, nodeName, trackName);
                      const locked = lockedPoints.has(lockKey);
                      const missing = !point?.visible ||
                        !Number.isFinite(point.x) ||
                        !Number.isFinite(point.y);
                      return (
                        <div
                          key={nodeName}
                          className="flex items-center gap-2 border-b border-border/60 px-2 py-1 last:border-b-0"
                        >
                          <span className="min-w-0 flex-1 truncate text-[11px]" title={nodeName}>
                            {nodeName}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] tabular-nums",
                              missing
                                ? "text-red-400"
                                : (point.score ?? 1) < confidenceThreshold
                                  ? "text-amber-400"
                                  : "text-muted-foreground",
                            )}
                          >
                            {missing ? "missing" : (point.score ?? 1).toFixed(2)}
                          </span>
                          <Button
                            variant={locked ? "secondary" : "ghost"}
                            size="icon-xs"
                            aria-label={`${locked ? "Unlock" : "Lock"} ${nodeName} on frame ${frameIdx}`}
                            title={locked ? "Allow AI retracking" : "Protect from AI retracking"}
                            onClick={() => togglePointLock(nodeName)}
                          >
                            {locked ? <Lock /> : <Unlock />}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Drag a point on the canvas to correct it, then lock it here so a later AI pass preserves the edit.
                  </p>
                </>
              )}
            </section>

            <Separator />

            <section className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium">Weapon constraints</h3>
                <Badge
                  variant={hasHands && hasWeaponLine && hasGrips ? "secondary" : "outline"}
                  className="text-[10px]"
                >
                  {hasHands && hasWeaponLine && hasGrips ? "Ready" : "Needs anchors"}
                </Badge>
              </div>
              {detectedRoles.length > 0 && (
                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[10px]">
                  {detectedRoles.map(([role, node]) => (
                    <div className="contents" key={role}>
                      <span className="text-muted-foreground">{role}</span>
                      <span className="truncate text-right" title={node}>{node}</span>
                    </div>
                  ))}
                </div>
              )}
              {(!hasHands || !hasWeaponLine || !hasGrips) && (
                <p className="rounded border border-dashed border-border p-2 text-[10px] text-muted-foreground">
                  For automatic grip checks, name nodes as front_hand/rear_hand,
                  spear_tip/spear_tail, and front_grip/rear_grip (Chinese aliases
                  such as 前手、后手、枪尖、枪尾、前握点、后握点 also work).
                </p>
              )}
              <label htmlFor="motion-rig-notes" className="block text-[11px] font-medium">
                Review notes
              </label>
              <textarea
                id="motion-rig-notes"
                className="min-h-16 w-full resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                value={reviewState.notesByFrame[String(frameIdx)] ?? ""}
                placeholder="Example: preserve spear angle; rear hand stays behind front hand."
                onChange={(event) =>
                  persistReview((current) =>
                    setMotionRigFrameNote(current, frameIdx, event.target.value),
                  )
                }
              />
            </section>
          </>
        )}
      </div>

      <Separator />
      <div className="shrink-0 p-2">
        <Button
          variant="subtle"
          size="xs"
          className="w-full"
          disabled={!labels || !video || nodeNames.length === 0}
          onClick={copyReviewManifest}
        >
          {copyStatus === "copied" ? <Check /> : <Clipboard />}
          {copyStatus === "copied"
            ? "Copied review JSON"
            : copyStatus === "failed"
              ? "Clipboard unavailable"
              : "Copy review JSON"}
        </Button>
      </div>
    </div>
  );
}
