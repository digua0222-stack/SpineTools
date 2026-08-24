/**
 * Pure helpers for retargeting 2D motion-rig landmarks onto cropped T-pose
 * components. The module deliberately has no DOM, canvas, or SLEAP runtime
 * dependency so the same binding contract can be used by the editor, tests,
 * and future exporters.
 */

export const TPOS_BINDING_SCHEMA = "tpose-bind/v1" as const;

export type TPosVec2Tuple = readonly [number, number];
export type TPosRectTuple = readonly [number, number, number, number];
export type TPosScaleClamp = readonly [number, number];

export interface TPosAtlas {
  file: string;
  width: number;
  height: number;
  background?: string;
  transparent?: boolean;
}

export interface TPosAnchorBinding {
  /** Motion-rig node that this image-local point should follow. */
  node: string;
  /** Point in cropped-part pixels, relative to the part rect's top-left. */
  local: TPosVec2Tuple;
  /** Optional least-squares influence. Defaults to 1. */
  weight?: number;
}

export interface TPosScalePolicy {
  /** Lock the part to this absolute image-to-motion scale. */
  fixed?: number;
  /** Lower bound for fitted uniform scale. */
  min?: number;
  /** Upper bound for fitted uniform scale. */
  max?: number;
}

export type TPosSolveMode = "translation" | "similarity-2d";

export interface TPosPartBinding {
  id: string;
  name?: string;
  /** Atlas crop in atlas pixels: x, y, width, height. */
  rect: TPosRectTuple;
  /** Rotation/scale origin in cropped-part pixels. */
  pivot: TPosVec2Tuple;
  anchors: readonly TPosAnchorBinding[];
  /**
   * Optional directed motion-rig bone used to orient single-anchor accessories.
   * This does not add another positional anchor: it only supplies rotation.
   */
  driverNodes?: readonly [string, string];
  /** Radians added to the driver bone's image-space angle. */
  rotationOffset?: number;
  /** Optional semantic parent bone; useful to exporters and the editor. */
  bone?: string;
  slot: string;
  z: number;
  solve: TPosSolveMode;
  visible?: boolean;
  scale?: TPosScalePolicy;
}

export interface TPosBindingManifest {
  schema: typeof TPOS_BINDING_SCHEMA;
  atlas: TPosAtlas;
  settings?: {
    /** Default fitted-scale bounds. Parts may override either endpoint. */
    scaleClamp?: TPosScaleClamp;
  };
  parts: readonly TPosPartBinding[];
}

export interface TPosTargetPoint {
  x: number;
  y: number;
  visible?: boolean;
}

export type TPosFramePoints = Readonly<
  Record<string, TPosTargetPoint | undefined>
>;

/** Canvas/CSS compatible affine matrix: [a c tx; b d ty; 0 0 1]. */
export interface TPosAffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export interface TPosRenderTransform {
  /** Global position of the part pivot. */
  x: number;
  y: number;
  /** Clockwise-positive in image coordinates, in radians. */
  rotation: number;
  scaleX: number;
  scaleY: number;
  /** Maps cropped-part local pixels directly into motion/video pixels. */
  matrix: TPosAffineMatrix;
}

export interface TPosAnchorProjection {
  node: string;
  local: TPosVec2Tuple;
  weight: number;
  /** Observed motion-rig location, or null when missing/occluded. */
  world: TPosTargetPoint | null;
  /** Location produced by the solved transform. */
  predicted: TPosTargetPoint | null;
  error: number | null;
  used: boolean;
}

export type TPosPartSolveStatus =
  | "solved"
  | "degraded"
  | "fallback"
  | "unresolved";

export interface TPosPartSolution {
  id: string;
  name?: string;
  bone?: string;
  slot: string;
  z: number;
  sourceRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pivot: TPosVec2Tuple;
  visible: boolean;
  status: TPosPartSolveStatus;
  transform: TPosRenderTransform;
  anchors: TPosAnchorProjection[];
  usedAnchorCount: number;
  rmse: number | null;
  maxError: number | null;
}

export interface TPosBindingEvaluation {
  frameIdx: number;
  /** Stable painter's order: z, then slot, then id. */
  parts: TPosPartSolution[];
}

export interface TPosPartSolveOptions {
  fallbackTransform?: TPosRenderTransform;
  scaleClamp?: TPosScaleClamp;
}

export interface TPosBindingEvaluationOptions {
  /** Previous/rest transforms used when current-frame anchors disappear. */
  fallbackTransforms?: Readonly<
    Record<string, TPosRenderTransform | undefined>
  >;
  /** Additional default bounds; manifest settings take precedence. */
  scaleClamp?: TPosScaleClamp;
}

export interface TPosValidationSummary {
  partCount: number;
  resolvedPartCount: number;
  unresolvedPartIds: string[];
  measuredAnchorCount: number;
  missingAnchorCount: number;
  rmse: number | null;
  maxError: number | null;
  /** Parts whose RMSE or maximum anchor error exceeds the requested limit. */
  partsOverTolerance: string[];
}

const EPSILON = 1e-9;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new Error(`Invalid ${TPOS_BINDING_SCHEMA} at ${path}: ${message}`);
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    fail(path, "expected a non-empty string");
  }
  return value;
}

function readFinite(value: unknown, path: string): number {
  if (!finite(value)) fail(path, "expected a finite number");
  return value;
}

function readPositive(value: unknown, path: string): number {
  const result = readFinite(value, path);
  if (result <= 0) fail(path, "expected a number greater than zero");
  return result;
}

function readVec2(value: unknown, path: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    fail(path, "expected [x, y]");
  }
  return [readFinite(value[0], `${path}[0]`), readFinite(value[1], `${path}[1]`)];
}

function readRect(value: unknown, path: string): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) {
    fail(path, "expected [x, y, width, height]");
  }
  return [
    readFinite(value[0], `${path}[0]`),
    readFinite(value[1], `${path}[1]`),
    readPositive(value[2], `${path}[2]`),
    readPositive(value[3], `${path}[3]`),
  ];
}

function readScaleClamp(value: unknown, path: string): [number, number] {
  const result = readVec2(value, path);
  if (result[0] <= 0 || result[1] <= 0 || result[0] > result[1]) {
    fail(path, "expected 0 < min <= max");
  }
  return result;
}

function parseScalePolicy(value: unknown, path: string): TPosScalePolicy {
  if (!isRecord(value)) fail(path, "expected an object");
  const result: TPosScalePolicy = {};
  if (value.fixed !== undefined) result.fixed = readPositive(value.fixed, `${path}.fixed`);
  if (value.min !== undefined) result.min = readPositive(value.min, `${path}.min`);
  if (value.max !== undefined) result.max = readPositive(value.max, `${path}.max`);
  if (result.min !== undefined && result.max !== undefined && result.min > result.max) {
    fail(path, "scale.min must not exceed scale.max");
  }
  return result;
}

/** Parse and defensively copy a portable binding manifest. */
export function parseTPosBindingManifest(value: unknown): TPosBindingManifest {
  let input: unknown = value;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input) as unknown;
    } catch {
      fail("$", "expected valid JSON");
    }
  }
  if (!isRecord(input)) fail("$", "expected an object");
  if (input.schema !== TPOS_BINDING_SCHEMA) {
    fail("$.schema", `expected ${TPOS_BINDING_SCHEMA}`);
  }

  if (!isRecord(input.atlas)) fail("$.atlas", "expected an object");
  const atlas: TPosAtlas = {
    file: readString(input.atlas.file, "$.atlas.file"),
    width: readPositive(input.atlas.width, "$.atlas.width"),
    height: readPositive(input.atlas.height, "$.atlas.height"),
  };
  if (input.atlas.background !== undefined) {
    atlas.background = readString(input.atlas.background, "$.atlas.background");
  }
  if (input.atlas.transparent !== undefined) {
    if (typeof input.atlas.transparent !== "boolean") {
      fail("$.atlas.transparent", "expected a boolean");
    }
    atlas.transparent = input.atlas.transparent;
  }

  let settings: TPosBindingManifest["settings"];
  if (input.settings !== undefined) {
    if (!isRecord(input.settings)) fail("$.settings", "expected an object");
    settings = {};
    if (input.settings.scaleClamp !== undefined) {
      settings.scaleClamp = readScaleClamp(
        input.settings.scaleClamp,
        "$.settings.scaleClamp",
      );
    }
  }

  if (!Array.isArray(input.parts)) fail("$.parts", "expected an array");
  const ids = new Set<string>();
  const parts = input.parts.map((rawPart, partIndex): TPosPartBinding => {
    const path = `$.parts[${partIndex}]`;
    if (!isRecord(rawPart)) fail(path, "expected an object");
    const id = readString(rawPart.id, `${path}.id`);
    if (ids.has(id)) fail(`${path}.id`, `duplicate id ${id}`);
    ids.add(id);

    if (!Array.isArray(rawPart.anchors) || rawPart.anchors.length === 0) {
      fail(`${path}.anchors`, "expected at least one anchor");
    }
    const anchors = rawPart.anchors.map((rawAnchor, anchorIndex): TPosAnchorBinding => {
      const anchorPath = `${path}.anchors[${anchorIndex}]`;
      if (!isRecord(rawAnchor)) fail(anchorPath, "expected an object");
      const anchor: TPosAnchorBinding = {
        node: readString(rawAnchor.node, `${anchorPath}.node`),
        local: readVec2(rawAnchor.local, `${anchorPath}.local`),
      };
      if (rawAnchor.weight !== undefined) {
        anchor.weight = readPositive(rawAnchor.weight, `${anchorPath}.weight`);
      }
      return anchor;
    });

    const solve = rawPart.solve;
    if (solve !== "translation" && solve !== "similarity-2d") {
      fail(`${path}.solve`, "expected translation or similarity-2d");
    }
    const rect = readRect(rawPart.rect, `${path}.rect`);
    if (rect[0] < 0 || rect[1] < 0) {
      fail(`${path}.rect`, "x and y must be non-negative atlas coordinates");
    }
    if (rect[0] + rect[2] > atlas.width || rect[1] + rect[3] > atlas.height) {
      fail(`${path}.rect`, "crop must stay within atlas bounds");
    }
    const pivot = readVec2(rawPart.pivot, `${path}.pivot`);
    if (pivot[0] < 0 || pivot[1] < 0 || pivot[0] > rect[2] || pivot[1] > rect[3]) {
      fail(`${path}.pivot`, "point must stay within the cropped part");
    }
    anchors.forEach((anchor, anchorIndex) => {
      if (
        anchor.local[0] < 0 ||
        anchor.local[1] < 0 ||
        anchor.local[0] > rect[2] ||
        anchor.local[1] > rect[3]
      ) {
        fail(
          `${path}.anchors[${anchorIndex}].local`,
          "point must stay within the cropped part",
        );
      }
    });
    const part: TPosPartBinding = {
      id,
      rect,
      pivot,
      anchors,
      slot: readString(rawPart.slot, `${path}.slot`),
      z: readFinite(rawPart.z, `${path}.z`),
      solve,
    };
    if (rawPart.name !== undefined) part.name = readString(rawPart.name, `${path}.name`);
    if (rawPart.bone !== undefined) part.bone = readString(rawPart.bone, `${path}.bone`);
    if (rawPart.driverNodes !== undefined) {
      if (!Array.isArray(rawPart.driverNodes) || rawPart.driverNodes.length !== 2) {
        fail(`${path}.driverNodes`, "expected [fromNode, toNode]");
      }
      part.driverNodes = [
        readString(rawPart.driverNodes[0], `${path}.driverNodes[0]`),
        readString(rawPart.driverNodes[1], `${path}.driverNodes[1]`),
      ];
    }
    if (rawPart.rotationOffset !== undefined) {
      part.rotationOffset = readFinite(
        rawPart.rotationOffset,
        `${path}.rotationOffset`,
      );
    }
    if (rawPart.visible !== undefined) {
      if (typeof rawPart.visible !== "boolean") {
        fail(`${path}.visible`, "expected a boolean");
      }
      part.visible = rawPart.visible;
    }
    if (rawPart.scale !== undefined) {
      part.scale = parseScalePolicy(rawPart.scale, `${path}.scale`);
    }
    return part;
  });

  return {
    schema: TPOS_BINDING_SCHEMA,
    atlas,
    ...(settings === undefined ? {} : { settings }),
    parts,
  };
}

/** Normalize then stringify, giving downstream tools a deterministic contract. */
export function stringifyTPosBindingManifest(
  manifest: TPosBindingManifest,
  space = 2,
): string {
  return JSON.stringify(parseTPosBindingManifest(manifest), null, space);
}

export function identityTPosTransform(): TPosRenderTransform {
  return {
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  };
}

export function transformTPosPoint(
  matrix: TPosAffineMatrix,
  point: TPosVec2Tuple | TPosTargetPoint,
): TPosTargetPoint {
  const x = "x" in point ? point.x : point[0];
  const y = "y" in point ? point.y : point[1];
  return {
    x: matrix.a * x + matrix.c * y + matrix.tx,
    y: matrix.b * x + matrix.d * y + matrix.ty,
  };
}

export function inverseTPosTransform(
  transform: TPosRenderTransform,
): TPosRenderTransform | null {
  const matrix = transform.matrix;
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!finite(determinant) || Math.abs(determinant) <= EPSILON) return null;
  const inverse: TPosAffineMatrix = {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    tx: (matrix.c * matrix.ty - matrix.d * matrix.tx) / determinant,
    ty: (matrix.b * matrix.tx - matrix.a * matrix.ty) / determinant,
  };
  return renderTransform(inverse, [0, 0]);
}

interface AnchorPair {
  anchor: TPosAnchorBinding;
  target: TPosTargetPoint;
  weight: number;
}

function usablePoint(point: TPosTargetPoint | undefined): point is TPosTargetPoint {
  return !!point && point.visible !== false && finite(point.x) && finite(point.y);
}

function stableCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function scaleOf(matrix: TPosAffineMatrix): number {
  return Math.hypot(matrix.a, matrix.b);
}

function rotationOf(matrix: TPosAffineMatrix): number {
  return Math.atan2(matrix.b, matrix.a);
}

function matrixFromScaleRotation(scale: number, rotation: number): TPosAffineMatrix {
  const a = Math.cos(rotation) * scale;
  const b = Math.sin(rotation) * scale;
  return { a, b, c: -b, d: a, tx: 0, ty: 0 };
}

function renderTransform(
  matrix: TPosAffineMatrix,
  pivot: TPosVec2Tuple,
): TPosRenderTransform {
  const worldPivot = transformTPosPoint(matrix, pivot);
  const scale = scaleOf(matrix);
  return {
    x: worldPivot.x,
    y: worldPivot.y,
    rotation: rotationOf(matrix),
    scaleX: scale,
    scaleY: scale,
    matrix: { ...matrix },
  };
}

function weightedCentroids(pairs: readonly AnchorPair[]): {
  local: TPosTargetPoint;
  world: TPosTargetPoint;
} {
  let total = 0;
  let localX = 0;
  let localY = 0;
  let worldX = 0;
  let worldY = 0;
  for (const pair of pairs) {
    total += pair.weight;
    localX += pair.anchor.local[0] * pair.weight;
    localY += pair.anchor.local[1] * pair.weight;
    worldX += pair.target.x * pair.weight;
    worldY += pair.target.y * pair.weight;
  }
  return {
    local: { x: localX / total, y: localY / total },
    world: { x: worldX / total, y: worldY / total },
  };
}

function effectiveScaleRange(
  part: TPosPartBinding,
  fallbackClamp?: TPosScaleClamp,
): [number, number] {
  const min = part.scale?.min ?? fallbackClamp?.[0] ?? EPSILON;
  const max = part.scale?.max ?? fallbackClamp?.[1] ?? Number.POSITIVE_INFINITY;
  return min <= max ? [min, max] : [min, min];
}

function clampScale(scale: number, range: TPosScaleClamp): number {
  return Math.max(range[0], Math.min(range[1], scale));
}

function linearForSingleAnchor(
  part: TPosPartBinding,
  points: TPosFramePoints,
  fallback: TPosRenderTransform | undefined,
  scaleClamp: TPosScaleClamp,
): TPosAffineMatrix {
  const fallbackScale = fallback ? scaleOf(fallback.matrix) : 1;
  const fixedOrFallback = part.scale?.fixed ?? fallbackScale;
  const scale = clampScale(fixedOrFallback, scaleClamp);
  let rotation = fallback ? rotationOf(fallback.matrix) : 0;
  if (part.driverNodes) {
    const from = points[part.driverNodes[0]];
    const to = points[part.driverNodes[1]];
    if (usablePoint(from) && usablePoint(to)) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      if (Math.hypot(dx, dy) > EPSILON) {
        rotation = Math.atan2(dy, dx) + (part.rotationOffset ?? 0);
      }
    }
  }
  return matrixFromScaleRotation(scale, rotation);
}

function alignLinearToCentroids(
  linear: TPosAffineMatrix,
  centroids: ReturnType<typeof weightedCentroids>,
): TPosAffineMatrix {
  return {
    ...linear,
    tx:
      centroids.world.x -
      linear.a * centroids.local.x -
      linear.c * centroids.local.y,
    ty:
      centroids.world.y -
      linear.b * centroids.local.x -
      linear.d * centroids.local.y,
  };
}

function solveSimilarity(
  pairs: readonly AnchorPair[],
  part: TPosPartBinding,
  points: TPosFramePoints,
  fallback: TPosRenderTransform | undefined,
  scaleClamp: TPosScaleClamp,
): { matrix: TPosAffineMatrix; degraded: boolean } {
  const centroids = weightedCentroids(pairs);
  if (pairs.length < 2) {
    return {
      matrix: alignLinearToCentroids(
        linearForSingleAnchor(part, points, fallback, scaleClamp),
        centroids,
      ),
      degraded: true,
    };
  }

  let denominator = 0;
  let aNumerator = 0;
  let bNumerator = 0;
  for (const pair of pairs) {
    const px = pair.anchor.local[0] - centroids.local.x;
    const py = pair.anchor.local[1] - centroids.local.y;
    const qx = pair.target.x - centroids.world.x;
    const qy = pair.target.y - centroids.world.y;
    denominator += pair.weight * (px * px + py * py);
    aNumerator += pair.weight * (px * qx + py * qy);
    bNumerator += pair.weight * (px * qy - py * qx);
  }

  if (denominator <= EPSILON) {
    return {
      matrix: alignLinearToCentroids(
        linearForSingleAnchor(part, points, fallback, scaleClamp),
        centroids,
      ),
      degraded: true,
    };
  }

  const rawA = aNumerator / denominator;
  const rawB = bNumerator / denominator;
  const rawScale = Math.hypot(rawA, rawB);
  // Coincident/near-coincident world anchors contain no usable direction or
  // scale information. We can still return a stable transform, but calling it
  // fully solved would hide the same under-constraint reported for one anchor.
  const collapsedTargets = rawScale <= EPSILON;
  const fallbackRotation = fallback ? rotationOf(fallback.matrix) : 0;
  const rotation = collapsedTargets ? fallbackRotation : Math.atan2(rawB, rawA);
  const requestedScale = part.scale?.fixed ?? (collapsedTargets ? 1 : rawScale);
  const linear = matrixFromScaleRotation(
    clampScale(requestedScale, scaleClamp),
    rotation,
  );
  return {
    matrix: alignLinearToCentroids(linear, centroids),
    degraded: collapsedTargets,
  };
}

function solveTranslation(
  pairs: readonly AnchorPair[],
  part: TPosPartBinding,
  points: TPosFramePoints,
  fallback: TPosRenderTransform | undefined,
  scaleClamp: TPosScaleClamp,
): TPosAffineMatrix {
  return alignLinearToCentroids(
    linearForSingleAnchor(part, points, fallback, scaleClamp),
    weightedCentroids(pairs),
  );
}

function projectAnchors(
  part: TPosPartBinding,
  points: TPosFramePoints,
  matrix: TPosAffineMatrix | null,
): {
  anchors: TPosAnchorProjection[];
  rmse: number | null;
  maxError: number | null;
} {
  let weightedSquaredError = 0;
  let totalWeight = 0;
  let maxError: number | null = null;
  const anchors = part.anchors.map((anchor): TPosAnchorProjection => {
    const target = points[anchor.node];
    const world = usablePoint(target)
      ? { x: target.x, y: target.y, visible: target.visible }
      : null;
    const predicted = matrix ? transformTPosPoint(matrix, anchor.local) : null;
    const error = world && predicted
      ? Math.hypot(world.x - predicted.x, world.y - predicted.y)
      : null;
    const weight = anchor.weight ?? 1;
    if (error !== null) {
      weightedSquaredError += weight * error * error;
      totalWeight += weight;
      maxError = Math.max(maxError ?? 0, error);
    }
    return {
      node: anchor.node,
      local: [anchor.local[0], anchor.local[1]],
      weight,
      world,
      predicted,
      error,
      used: world !== null,
    };
  });
  return {
    anchors,
    rmse: totalWeight > 0 ? Math.sqrt(weightedSquaredError / totalWeight) : null,
    maxError,
  };
}

/** Solve one part against the visible nodes in a motion-rig frame. */
export function solveTPosPart(
  part: TPosPartBinding,
  points: TPosFramePoints,
  options: TPosPartSolveOptions = {},
): TPosPartSolution {
  const pairs: AnchorPair[] = [];
  for (const anchor of part.anchors) {
    const target = points[anchor.node];
    if (usablePoint(target)) {
      pairs.push({ anchor, target, weight: anchor.weight ?? 1 });
    }
  }

  const scaleClamp = effectiveScaleRange(part, options.scaleClamp);
  let matrix: TPosAffineMatrix;
  let status: TPosPartSolveStatus;
  if (pairs.length === 0) {
    if (options.fallbackTransform) {
      matrix = { ...options.fallbackTransform.matrix };
      status = "fallback";
    } else {
      matrix = identityTPosTransform().matrix;
      status = "unresolved";
    }
  } else if (part.solve === "translation") {
    matrix = solveTranslation(
      pairs,
      part,
      points,
      options.fallbackTransform,
      scaleClamp,
    );
    status = "solved";
  } else {
    const result = solveSimilarity(
      pairs,
      part,
      points,
      options.fallbackTransform,
      scaleClamp,
    );
    matrix = result.matrix;
    status = result.degraded ? "degraded" : "solved";
  }

  const transform = renderTransform(matrix, part.pivot);
  const projections = projectAnchors(
    part,
    points,
    status === "unresolved" ? null : matrix,
  );
  return {
    id: part.id,
    ...(part.name === undefined ? {} : { name: part.name }),
    ...(part.bone === undefined ? {} : { bone: part.bone }),
    slot: part.slot,
    z: part.z,
    sourceRect: {
      x: part.rect[0],
      y: part.rect[1],
      width: part.rect[2],
      height: part.rect[3],
    },
    pivot: [part.pivot[0], part.pivot[1]],
    visible: part.visible !== false && status !== "unresolved",
    status,
    transform,
    anchors: projections.anchors,
    usedAnchorCount: pairs.length,
    rmse: projections.rmse,
    maxError: projections.maxError,
  };
}

/** Evaluate all parts in deterministic painter's order. */
export function evaluateTPosBinding(
  manifest: TPosBindingManifest,
  frameIdx: number,
  points: TPosFramePoints,
  options: TPosBindingEvaluationOptions = {},
): TPosBindingEvaluation {
  const defaultClamp =
    manifest.settings?.scaleClamp ?? options.scaleClamp;
  const parts = manifest.parts.map((part) =>
    solveTPosPart(part, points, {
      fallbackTransform: options.fallbackTransforms?.[part.id],
      ...(defaultClamp === undefined ? {} : { scaleClamp: defaultClamp }),
    }),
  );
  parts.sort(
    (a, b) =>
      a.z - b.z || stableCompare(a.slot, b.slot) || stableCompare(a.id, b.id),
  );
  return { frameIdx, parts };
}

/** Extract transforms for use as deterministic next-frame fallbacks. */
export function tposFallbackTransforms(
  evaluation: TPosBindingEvaluation,
): Record<string, TPosRenderTransform> {
  return Object.fromEntries(
    evaluation.parts
      .filter((part) => part.status !== "unresolved")
      .map((part) => [part.id, part.transform]),
  );
}

/** Aggregate anchor reprojection errors into acceptance-test friendly metrics. */
export function summarizeTPosValidation(
  evaluation: TPosBindingEvaluation,
  tolerance = 8,
): TPosValidationSummary {
  const errors: number[] = [];
  let missingAnchorCount = 0;
  const partsOverTolerance: string[] = [];
  for (const part of evaluation.parts) {
    for (const anchor of part.anchors) {
      if (anchor.error === null) missingAnchorCount += 1;
      else errors.push(anchor.error);
    }
    if (
      (part.rmse !== null && part.rmse > tolerance) ||
      (part.maxError !== null && part.maxError > tolerance)
    ) {
      partsOverTolerance.push(part.id);
    }
  }
  const squaredTotal = errors.reduce((sum, error) => sum + error * error, 0);
  const unresolvedPartIds = evaluation.parts
    .filter((part) => part.status === "unresolved")
    .map((part) => part.id);
  return {
    partCount: evaluation.parts.length,
    resolvedPartCount: evaluation.parts.length - unresolvedPartIds.length,
    unresolvedPartIds,
    measuredAnchorCount: errors.length,
    missingAnchorCount,
    rmse: errors.length > 0 ? Math.sqrt(squaredTotal / errors.length) : null,
    maxError: errors.length > 0 ? Math.max(...errors) : null,
    partsOverTolerance,
  };
}
