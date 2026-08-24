/** Evaluate the real Zhao Yun 107-frame sequence against the 23-part binding. */

import {
  evaluateTPosBinding,
  parseTPosBindingManifest,
  summarizeTPosValidation,
  tposFallbackTransforms,
  type TPosPartSolveStatus,
  type TPosRenderTransform,
} from "../src/lib/tposeBinding";

const root = new URL("../", import.meta.url);
const bindingUrl = new URL("demo/zhaoyun/zhaoyun.tpose-bind.json", root);
const motionUrl = new URL("demo/zhaoyun/zhaoyun.motionrig.json", root);
const outputUrl = new URL("demo/zhaoyun/zhaoyun.tpose-validation.json", root);
const publicOutputUrl = new URL("public/demo/zhaoyun/zhaoyun.tpose-validation.json", root);
const tolerancePx = 8;

const binding = parseTPosBindingManifest(
  JSON.parse(await Bun.file(bindingUrl).text()),
);
const motion = JSON.parse(await Bun.file(motionUrl).text()) as {
  frames: Array<{
    frameIndex?: number;
    frame_index?: number;
    points: Record<string, { x: number; y: number; visible?: boolean }>;
  }>;
};

const statusCounts: Record<TPosPartSolveStatus, number> = {
  solved: 0,
  degraded: 0,
  fallback: 0,
  unresolved: 0,
};
const weaponStatusCounts = { ...statusCounts };
let fallbacks: Record<string, TPosRenderTransform | undefined> = {};

const frames = motion.frames.map((frame, index) => {
  const frameIdx = frame.frameIndex ?? frame.frame_index ?? index;
  const evaluation = evaluateTPosBinding(binding, frameIdx, frame.points, {
    fallbackTransforms: fallbacks,
  });
  fallbacks = tposFallbackTransforms(evaluation);
  const summary = summarizeTPosValidation(evaluation, tolerancePx);
  const statuses: Record<TPosPartSolveStatus, number> = {
    solved: 0,
    degraded: 0,
    fallback: 0,
    unresolved: 0,
  };
  for (const part of evaluation.parts) {
    statuses[part.status] += 1;
    statusCounts[part.status] += 1;
    if (part.id === "weapon") weaponStatusCounts[part.status] += 1;
  }
  return {
    frameIndex: frameIdx,
    resolvedParts: summary.resolvedPartCount,
    partCount: summary.partCount,
    statuses,
    measuredAnchors: summary.measuredAnchorCount,
    missingAnchors: summary.missingAnchorCount,
    rmsePx: summary.rmse === null ? null : Number(summary.rmse.toFixed(4)),
    maxErrorPx:
      summary.maxError === null ? null : Number(summary.maxError.toFixed(4)),
    partsOverTolerance: summary.partsOverTolerance,
  };
});

const withError = frames.filter(
  (frame): frame is typeof frame & { rmsePx: number; maxErrorPx: number } =>
    frame.rmsePx !== null && frame.maxErrorPx !== null,
);
const worstFrames = [...withError]
  .sort((a, b) => b.rmsePx - a.rmsePx || a.frameIndex - b.frameIndex)
  .slice(0, 12)
  .map(({ frameIndex, rmsePx, maxErrorPx, partsOverTolerance }) => ({
    frameIndex,
    rmsePx,
    maxErrorPx,
    partsOverTolerance,
  }));

const report = {
  schema: "tpose-validation/v1",
  inputs: {
    motion: "zhaoyun.motionrig.json",
    binding: "zhaoyun.tpose-bind.json",
    atlas: binding.atlas.file,
  },
  thresholds: { anchorTolerancePx: tolerancePx },
  aggregate: {
    frameCount: frames.length,
    partCount: binding.parts.length,
    fullyResolvedFrameCount: frames.filter(
      (frame) => frame.resolvedParts === frame.partCount,
    ).length,
    framesOverTolerance: frames
      .filter((frame) => frame.partsOverTolerance.length > 0)
      .map((frame) => frame.frameIndex),
    meanRmsePx:
      withError.length === 0
        ? null
        : Number(
            (
              withError.reduce((sum, frame) => sum + frame.rmsePx, 0) /
              withError.length
            ).toFixed(4),
          ),
    maxRmsePx:
      withError.length === 0
        ? null
        : Number(Math.max(...withError.map((frame) => frame.rmsePx)).toFixed(4)),
    statusCounts,
    weaponStatusCounts,
    worstFrames,
  },
  frames,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
await Bun.write(outputUrl, serialized);
await Bun.write(publicOutputUrl, serialized);
console.log(
  JSON.stringify(
    {
      output: outputUrl.pathname,
      frameCount: report.aggregate.frameCount,
      fullyResolvedFrameCount: report.aggregate.fullyResolvedFrameCount,
      meanRmsePx: report.aggregate.meanRmsePx,
      maxRmsePx: report.aggregate.maxRmsePx,
      framesOverTolerance: report.aggregate.framesOverTolerance.length,
      weaponStatusCounts,
    },
    null,
    2,
  ),
);
