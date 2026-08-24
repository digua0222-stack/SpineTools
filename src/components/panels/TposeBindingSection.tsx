/** Loads a portable T-Pose binding manifest and adapts it to the preview UI. */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LoaderCircle, Puzzle, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  MotionRigEdge,
  MotionRigFrame,
  MotionRigPoint,
} from "@/lib/motionRigReview";
import {
  evaluateTPosBinding,
  parseTPosBindingManifest,
  summarizeTPosValidation,
  tposFallbackTransforms,
  type TPosBindingManifest,
  type TPosRenderTransform,
} from "@/lib/tposeBinding";
import {
  TposeBindingPreview,
  type TposeBindingViewSolution,
} from "./TposeBindingPreview";

interface TposeBindingSectionProps {
  manifestUrl: string | null;
  frameIdx: number;
  frameWidth: number;
  frameHeight: number;
  points: Record<string, MotionRigPoint>;
  frames?: readonly MotionRigFrame[];
  edges: readonly MotionRigEdge[];
}

type BindingLoadState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "ready"; manifest: TPosBindingManifest; atlasUrl: string }
  | { status: "missing"; message: string }
  | { status: "error"; message: string };

function atlasUrlFor(manifestUrl: string, atlasFile: string): string {
  let absoluteManifestUrl: URL;
  try {
    absoluteManifestUrl = new URL(manifestUrl, document.baseURI);
  } catch {
    // happy-dom and some embedded webviews begin at about:blank, which is not
    // a hierarchical URL. The real app base is hierarchical; this fallback
    // keeps relative asset resolution deterministic during bootstrap/tests.
    absoluteManifestUrl = new URL(manifestUrl, "http://localhost/");
  }
  const atlasUrl = new URL(atlasFile, absoluteManifestUrl);
  if (atlasUrl.protocol === "javascript:" || atlasUrl.protocol === "vbscript:") {
    throw new Error(`Unsupported T-Pose atlas URL scheme: ${atlasUrl.protocol}`);
  }
  return atlasUrl.href;
}

function viewSolution(
  solution: ReturnType<typeof evaluateTPosBinding>["parts"][number],
): TposeBindingViewSolution {
  return {
    id: solution.id,
    ...(solution.name === undefined ? {} : { name: solution.name }),
    ...(solution.bone === undefined ? {} : { bone: solution.bone }),
    slot: solution.slot,
    z: solution.z,
    sourceRect: [
      solution.sourceRect.x,
      solution.sourceRect.y,
      solution.sourceRect.width,
      solution.sourceRect.height,
    ],
    pivot: solution.pivot,
    visible: solution.visible,
    status: solution.status,
    transform: solution.transform,
    rmse: solution.rmse,
    maxError: solution.maxError,
    usedAnchorCount: solution.usedAnchorCount,
  };
}

export function TposeBindingSection({
  manifestUrl,
  frameIdx,
  frameWidth,
  frameHeight,
  points,
  frames,
  edges,
}: TposeBindingSectionProps) {
  const [retryNonce, setRetryNonce] = useState(0);
  const [loadState, setLoadState] = useState<BindingLoadState>(
    manifestUrl ? { status: "loading" } : { status: "empty" },
  );

  useEffect(() => {
    if (!manifestUrl) {
      setLoadState({ status: "empty" });
      return;
    }

    const controller = new AbortController();
    setLoadState({ status: "loading" });
    void (async () => {
      try {
        const response = await fetch(manifestUrl, { signal: controller.signal });
        // Some desktop/custom-protocol fetch implementations do not reject
        // when AbortSignal is triggered. Guard every state-writing branch so
        // a slower previous URL can never replace the current manifest.
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          setLoadState({
            status: "missing",
            message: `No binding manifest found at ${manifestUrl}`,
          });
          return;
        }
        if (!response.ok) {
          throw new Error(`Binding manifest request failed (${response.status})`);
        }
        const manifest = parseTPosBindingManifest(await response.json());
        if (controller.signal.aborted) return;
        setLoadState({
          status: "ready",
          manifest,
          atlasUrl: atlasUrlFor(manifestUrl, manifest.atlas.file),
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => controller.abort();
  }, [manifestUrl, retryNonce]);

  const evaluationResult = useMemo(() => {
    if (loadState.status !== "ready") return null;
    try {
      let evaluation: ReturnType<typeof evaluateTPosBinding> | null = null;
      let fallbackTransforms: Record<
        string,
        TPosRenderTransform | undefined
      > = {};

      // Re-evaluate from the beginning so a direct seek has the same
      // deterministic previous-frame fallback as the offline validator.
      // Motion-rig demos are short (107 frames in the bundled example), so
      // doing this in a memo is inexpensive and avoids navigation-order state.
      if (frames && frames.length > 0) {
        const orderedFrames = [...frames].sort(
          (left, right) => left.frameIdx - right.frameIdx,
        );
        for (const frame of orderedFrames) {
          if (frame.frameIdx > frameIdx) break;
          const frameEvaluation = evaluateTPosBinding(
            loadState.manifest,
            frame.frameIdx,
            frame.points,
            { fallbackTransforms },
          );
          fallbackTransforms = tposFallbackTransforms(frameEvaluation);
          if (frame.frameIdx === frameIdx) evaluation = frameEvaluation;
        }
      }
      evaluation ??= evaluateTPosBinding(
        loadState.manifest,
        frameIdx,
        points,
        { fallbackTransforms },
      );
      return {
        evaluation,
        summary: summarizeTPosValidation(evaluation),
        error: null,
      };
    } catch (error) {
      return {
        evaluation: null,
        summary: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [frameIdx, frames, loadState, points]);

  return (
    <details className="group border-b border-border/70" open data-testid="tpose-binding-section">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium">
        <Puzzle className="h-3.5 w-3.5" />
        T-Pose Binding
        {loadState.status === "ready" && (
          <Badge variant="secondary" className="ml-auto px-1.5 text-[9px]">
            {loadState.manifest.parts.length} parts
          </Badge>
        )}
      </summary>
      <div className="px-3 pb-3">
        {loadState.status === "empty" && (
          <div className="rounded-md border border-dashed border-border p-2 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">No T-Pose binding data attached.</p>
            <p className="mt-1">
              Pose correction remains available. Add a tpose-bind/v1 manifest to enable component preview.
            </p>
          </div>
        )}

        {loadState.status === "loading" && (
          <div className="flex items-center gap-2 rounded-md border border-border p-2 text-[11px] text-muted-foreground">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Loading T-Pose binding…
          </div>
        )}

        {(loadState.status === "missing" || loadState.status === "error") && (
          <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
            <div className="flex items-start gap-2 text-[11px] text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{loadState.message}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Landmark review is unaffected; only the componentized preview is unavailable.
            </p>
            <Button variant="subtle" size="xs" onClick={() => setRetryNonce((value) => value + 1)}>
              <RefreshCw /> Retry
            </Button>
          </div>
        )}

        {loadState.status === "ready" && evaluationResult?.error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-300">
            Binding evaluation failed: {evaluationResult.error}
          </div>
        )}

        {loadState.status === "ready" && evaluationResult?.evaluation && evaluationResult.summary && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1 text-[9px]" data-testid="tpose-binding-summary">
              <Badge variant="outline" className="px-1.5 text-[9px]">
                {evaluationResult.summary.resolvedPartCount}/{evaluationResult.summary.partCount} resolved
              </Badge>
              <Badge
                variant={evaluationResult.summary.partsOverTolerance.length > 0 ? "destructive" : "secondary"}
                className="px-1.5 text-[9px]"
              >
                RMSE {evaluationResult.summary.rmse === null
                  ? "—"
                  : `${evaluationResult.summary.rmse.toFixed(1)} px`}
              </Badge>
              {evaluationResult.summary.missingAnchorCount > 0 && (
                <Badge variant="outline" className="px-1.5 text-[9px]">
                  {evaluationResult.summary.missingAnchorCount} missing anchors
                </Badge>
              )}
            </div>
            <TposeBindingPreview
              manifest={loadState.manifest}
              solutions={evaluationResult.evaluation.parts.map(viewSolution)}
              atlasUrl={loadState.atlasUrl}
              frameIdx={frameIdx}
              frameWidth={frameWidth}
              frameHeight={frameHeight}
              points={points}
              edges={edges}
            />
          </div>
        )}
      </div>
    </details>
  );
}
