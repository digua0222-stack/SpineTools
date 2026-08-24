/**
 * Pure motion-rig review helpers.
 *
 * The UI deliberately works with small structural interfaces instead of the
 * concrete sleap-io classes. This keeps the analysis deterministic and makes
 * the resulting review manifest usable by a later Python/AI tracking stage.
 */

export interface MotionRigPoint {
  name: string;
  x: number;
  y: number;
  visible: boolean;
  complete: boolean;
  /** Point score, falling back to the instance score when available. */
  score?: number;
}

export interface MotionRigFrame {
  frameIdx: number;
  points: Record<string, MotionRigPoint>;
}

export interface MotionRigEdge {
  source: string;
  destination: string;
}

export interface MotionRigPointLike {
  xy: readonly number[];
  visible?: boolean;
  complete?: boolean;
  score?: number;
  name?: string;
}

export interface MotionRigInstanceLike {
  points: readonly MotionRigPointLike[];
  score?: number;
  track?: { name?: string | null } | null;
  skeleton?: { nodes?: readonly { name: string }[] } | null;
}

export interface MotionRigLabeledFrameLike {
  frameIdx: number;
  instances: readonly MotionRigInstanceLike[];
}

export type MotionRigIssueType =
  | "missing-point"
  | "low-confidence"
  | "bone-length"
  | "grip-distance";

export interface MotionRigIssue {
  id: string;
  frameIdx: number;
  type: MotionRigIssueType;
  nodeNames: string[];
  message: string;
  /** Normalized 0..1 ranking weight used by the review queue. */
  severity: number;
  /** True when every affected point has been manually protected. */
  locked: boolean;
  value?: number;
  reference?: number;
}

export interface MotionRigFrameReport {
  frameIdx: number;
  issues: MotionRigIssue[];
  actionableIssues: MotionRigIssue[];
  minConfidence: number | null;
  missingCount: number;
  boneAnomalyCount: number;
}

export interface MotionRigRoleMap {
  leftHand?: string;
  rightHand?: string;
  frontHand?: string;
  rearHand?: string;
  weaponTip?: string;
  weaponTail?: string;
  frontGrip?: string;
  rearGrip?: string;
}

export interface MotionRigAnalysisOptions {
  confidenceThreshold: number;
  /** Relative deviation from the sequence median, e.g. 0.2 = 20%. */
  boneLengthTolerance: number;
  /** Maximum hand/grip separation as a fraction of weapon length. */
  gripDistanceRatio?: number;
  /** Lower pixel bound for hand/grip separation. */
  minimumGripDistance?: number;
  lockedPointKeys?: ReadonlySet<string>;
  trackName?: string | null;
}

export interface MotionRigSequenceReport {
  frames: MotionRigFrameReport[];
  queue: MotionRigFrameReport[];
  referenceBoneLengths: Record<string, number>;
  roles: MotionRigRoleMap;
}

export const MOTION_RIG_REVIEW_VERSION = 1 as const;

export interface MotionRigReviewState {
  version: typeof MOTION_RIG_REVIEW_VERSION;
  lockedPoints: string[];
  notesByFrame: Record<string, string>;
}

export interface MotionRigReviewManifest {
  schema: "motion-rig-review@1";
  videoId: string;
  coordinateSpace: {
    units: "image-pixels";
    origin: "top-left";
  };
  trackName: string | null;
  skeleton: {
    nodes: string[];
    edges: MotionRigEdge[];
  };
  settings: {
    confidenceThreshold: number;
    boneLengthTolerance: number;
  };
  inferredRoles: MotionRigRoleMap;
  review: MotionRigReviewState;
}

const ROLE_ALIASES: Record<keyof MotionRigRoleMap, readonly string[]> = {
  leftHand: ["left_hand", "hand_l", "l_hand", "left_wrist", "左手", "左腕"],
  rightHand: ["right_hand", "hand_r", "r_hand", "right_wrist", "右手", "右腕"],
  frontHand: ["front_hand", "lead_hand", "hand_front", "前手", "前握手"],
  rearHand: ["rear_hand", "trail_hand", "hand_rear", "后手", "后握手"],
  weaponTip: [
    "weapon_tip",
    "spear_tip",
    "lance_tip",
    "gun_tip",
    "qiang_tip",
    "枪尖",
  ],
  weaponTail: [
    "weapon_tail",
    "spear_tail",
    "lance_tail",
    "gun_tail",
    "qiang_tail",
    "枪尾",
  ],
  frontGrip: [
    "front_grip",
    "weapon_grip_front",
    "spear_grip_front",
    "前握点",
    "前握把",
  ],
  rearGrip: [
    "rear_grip",
    "weapon_grip_rear",
    "spear_grip_rear",
    "后握点",
    "后握把",
  ],
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Canonicalize a node name without discarding CJK characters. */
export function normalizeMotionRigNodeName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

/** Stable key shared by the UI manifest and downstream tracking tools. */
export function motionRigPointLockKey(
  frameIdx: number,
  nodeName: string,
  trackName?: string | null,
): string {
  return `${frameIdx}:${encodeURIComponent(trackName ?? "")}:${encodeURIComponent(nodeName)}`;
}

export function emptyMotionRigReviewState(): MotionRigReviewState {
  return {
    version: MOTION_RIG_REVIEW_VERSION,
    lockedPoints: [],
    notesByFrame: {},
  };
}

/** Parse persisted review data defensively; malformed/old data is ignored. */
export function parseMotionRigReviewState(raw: string | null): MotionRigReviewState {
  if (!raw) return emptyMotionRigReviewState();
  try {
    const value = JSON.parse(raw) as Partial<MotionRigReviewState> | null;
    if (!value || value.version !== MOTION_RIG_REVIEW_VERSION) {
      return emptyMotionRigReviewState();
    }
    const lockedPoints = Array.isArray(value.lockedPoints)
      ? [...new Set(value.lockedPoints.filter((key): key is string => typeof key === "string"))]
      : [];
    const notesByFrame: Record<string, string> = {};
    if (value.notesByFrame && typeof value.notesByFrame === "object") {
      for (const [frame, note] of Object.entries(value.notesByFrame)) {
        if (typeof note === "string" && note.trim()) notesByFrame[frame] = note;
      }
    }
    return { version: MOTION_RIG_REVIEW_VERSION, lockedPoints, notesByFrame };
  } catch {
    return emptyMotionRigReviewState();
  }
}

export function setMotionRigPointLocked(
  state: MotionRigReviewState,
  key: string,
  locked: boolean,
): MotionRigReviewState {
  const keys = new Set(state.lockedPoints);
  if (locked) keys.add(key);
  else keys.delete(key);
  return { ...state, lockedPoints: [...keys].sort() };
}

export function setMotionRigFrameNote(
  state: MotionRigReviewState,
  frameIdx: number,
  note: string,
): MotionRigReviewState {
  const notesByFrame = { ...state.notesByFrame };
  if (note.trim()) notesByFrame[String(frameIdx)] = note;
  else delete notesByFrame[String(frameIdx)];
  return { ...state, notesByFrame };
}

/** Build the portable contract consumed by retracking/export tools. */
export function buildMotionRigReviewManifest(input: {
  videoId: string;
  trackName?: string | null;
  nodeNames: readonly string[];
  edges: readonly MotionRigEdge[];
  confidenceThreshold: number;
  boneLengthTolerance: number;
  roles: MotionRigRoleMap;
  review: MotionRigReviewState;
}): MotionRigReviewManifest {
  return {
    schema: "motion-rig-review@1",
    videoId: input.videoId,
    coordinateSpace: { units: "image-pixels", origin: "top-left" },
    trackName: input.trackName ?? null,
    skeleton: {
      nodes: [...input.nodeNames],
      edges: input.edges.map((edge) => ({ ...edge })),
    },
    settings: {
      confidenceThreshold: clamp01(input.confidenceThreshold),
      boneLengthTolerance: Math.max(0.001, input.boneLengthTolerance),
    },
    inferredRoles: { ...input.roles },
    review: {
      version: MOTION_RIG_REVIEW_VERSION,
      lockedPoints: [...input.review.lockedPoints].sort(),
      notesByFrame: { ...input.review.notesByFrame },
    },
  };
}

function instanceMatchesSkeleton(
  instance: MotionRigInstanceLike,
  nodeNames: readonly string[],
): boolean {
  const instanceNames = instance.skeleton?.nodes?.map((node) => node.name);
  if (!instanceNames || instanceNames.length !== nodeNames.length) return false;
  return instanceNames.every((name, index) => name === nodeNames[index]);
}

function chooseFrameInstance(
  frame: MotionRigLabeledFrameLike,
  nodeNames: readonly string[],
  trackName?: string | null,
): MotionRigInstanceLike | null {
  let candidates = [...frame.instances];
  if (trackName) {
    const tracked = candidates.filter((instance) => instance.track?.name === trackName);
    if (tracked.length > 0) candidates = tracked;
  }
  const matchingSkeleton = candidates.filter((instance) =>
    instanceMatchesSkeleton(instance, nodeNames),
  );
  if (matchingSkeleton.length > 0) candidates = matchingSkeleton;
  return candidates[0] ?? null;
}

/**
 * Convert SLEAP-like labeled frames into the small serializable representation
 * used by the review engine. One character/track is selected per frame.
 */
export function buildMotionRigFrames(
  labeledFrames: readonly MotionRigLabeledFrameLike[],
  nodeNames: readonly string[],
  trackName?: string | null,
): MotionRigFrame[] {
  const result: MotionRigFrame[] = [];
  for (const labeledFrame of labeledFrames) {
    const instance = chooseFrameInstance(labeledFrame, nodeNames, trackName);
    if (!instance) continue;
    const points: Record<string, MotionRigPoint> = {};
    nodeNames.forEach((name, index) => {
      const point = instance.points[index];
      const x = point?.xy[0] ?? Number.NaN;
      const y = point?.xy[1] ?? Number.NaN;
      const pointScore = finite(point?.score)
        ? point.score
        : finite(instance.score)
          ? instance.score
          : 1;
      points[name] = {
        name,
        x,
        y,
        visible: point?.visible !== false && finite(x) && finite(y),
        complete: point?.complete === true,
        score: pointScore,
      };
    });
    result.push({ frameIdx: labeledFrame.frameIdx, points });
  }
  return result.sort((a, b) => a.frameIdx - b.frameIdx);
}

export function inferMotionRigRoles(nodeNames: readonly string[]): MotionRigRoleMap {
  const byNormalized = new Map<string, string>();
  for (const name of nodeNames) {
    const normalized = normalizeMotionRigNodeName(name);
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, name);
  }

  const roles: MotionRigRoleMap = {};
  for (const [role, aliases] of Object.entries(ROLE_ALIASES) as Array<
    [keyof MotionRigRoleMap, readonly string[]]
  >) {
    for (const alias of aliases) {
      const match = byNormalized.get(normalizeMotionRigNodeName(alias));
      if (match) {
        roles[role] = match;
        break;
      }
    }
  }
  return roles;
}

type UsableMotionRigPoint = MotionRigPoint & { visible: true };

function usablePoint(
  point: MotionRigPoint | undefined,
): point is UsableMotionRigPoint {
  return !!point && point.visible && finite(point.x) && finite(point.y);
}

function pointDistance(a: MotionRigPoint, b: MotionRigPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function edgeKey(edge: MotionRigEdge): string {
  return `${edge.source} → ${edge.destination}`;
}

function referenceLengths(
  frames: readonly MotionRigFrame[],
  edges: readonly MotionRigEdge[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const edge of edges) {
    const lengths: number[] = [];
    for (const frame of frames) {
      const source = frame.points[edge.source];
      const destination = frame.points[edge.destination];
      if (usablePoint(source) && usablePoint(destination)) {
        lengths.push(pointDistance(source, destination));
      }
    }
    const value = median(lengths);
    if (value !== null && value > 0) result[edgeKey(edge)] = value;
  }
  return result;
}

function issueLocked(
  frameIdx: number,
  nodeNames: readonly string[],
  options: MotionRigAnalysisOptions,
): boolean {
  if (!options.lockedPointKeys || nodeNames.length === 0) return false;
  return nodeNames.every((nodeName) =>
    options.lockedPointKeys?.has(
      motionRigPointLockKey(frameIdx, nodeName, options.trackName),
    ),
  );
}

function makeIssue(
  frameIdx: number,
  type: MotionRigIssueType,
  nodeNames: string[],
  message: string,
  severity: number,
  options: MotionRigAnalysisOptions,
  values?: { value?: number; reference?: number },
): MotionRigIssue {
  return {
    id: `${frameIdx}:${type}:${nodeNames.join("+")}`,
    frameIdx,
    type,
    nodeNames,
    message,
    severity: clamp01(severity),
    locked: issueLocked(frameIdx, nodeNames, options),
    ...values,
  };
}

function weaponReferenceLength(
  frames: readonly MotionRigFrame[],
  roles: MotionRigRoleMap,
): number | null {
  if (!roles.weaponTip || !roles.weaponTail) return null;
  const lengths: number[] = [];
  for (const frame of frames) {
    const tip = frame.points[roles.weaponTip];
    const tail = frame.points[roles.weaponTail];
    if (usablePoint(tip) && usablePoint(tail)) lengths.push(pointDistance(tip, tail));
  }
  return median(lengths);
}

function chooseGripPairs(
  frame: MotionRigFrame,
  roles: MotionRigRoleMap,
): Array<[string, string]> {
  if (roles.frontHand && roles.rearHand && roles.frontGrip && roles.rearGrip) {
    return [
      [roles.frontHand, roles.frontGrip],
      [roles.rearHand, roles.rearGrip],
    ];
  }

  const hands = [roles.leftHand, roles.rightHand].filter(
    (name): name is string => !!name,
  );
  const grips = [roles.frontGrip, roles.rearGrip].filter(
    (name): name is string => !!name,
  );
  if (hands.length !== 2 || grips.length !== 2) return [];

  const [h0, h1] = hands;
  const [g0, g1] = grips;
  const hp0 = frame.points[h0];
  const hp1 = frame.points[h1];
  const gp0 = frame.points[g0];
  const gp1 = frame.points[g1];
  if (![hp0, hp1, gp0, gp1].every(usablePoint)) return [];

  const direct = pointDistance(hp0, gp0) + pointDistance(hp1, gp1);
  const crossed = pointDistance(hp0, gp1) + pointDistance(hp1, gp0);
  return direct <= crossed
    ? [
        [h0, g0],
        [h1, g1],
      ]
    : [
        [h0, g1],
        [h1, g0],
      ];
}

/** Analyze confidence, missing points, bone-length drift, and hand/grip contact. */
export function analyzeMotionRigSequence(
  frames: readonly MotionRigFrame[],
  edges: readonly MotionRigEdge[],
  options: MotionRigAnalysisOptions,
): MotionRigSequenceReport {
  const confidenceThreshold = clamp01(options.confidenceThreshold);
  const boneTolerance = Math.max(0.001, options.boneLengthTolerance);
  const gripRatio = Math.max(0.001, options.gripDistanceRatio ?? 0.08);
  const minGripDistance = Math.max(0, options.minimumGripDistance ?? 4);
  const nodeNames = frames[0] ? Object.keys(frames[0].points) : [];
  const roles = inferMotionRigRoles(nodeNames);
  const boneReferences = referenceLengths(frames, edges);
  const weaponLength = weaponReferenceLength(frames, roles);
  const gripLimit = weaponLength === null
    ? null
    : Math.max(minGripDistance, weaponLength * gripRatio);

  const reports: MotionRigFrameReport[] = frames.map((frame) => {
    const issues: MotionRigIssue[] = [];
    const scores: number[] = [];

    for (const point of Object.values(frame.points)) {
      if (!usablePoint(point)) {
        issues.push(
          makeIssue(
            frame.frameIdx,
            "missing-point",
            [point.name],
            `${point.name} is missing or occluded`,
            1,
            options,
          ),
        );
        continue;
      }
      if (finite(point.score)) {
        scores.push(point.score);
        if (point.score < confidenceThreshold) {
          const shortfall = (confidenceThreshold - point.score) /
            Math.max(confidenceThreshold, 0.001);
          issues.push(
            makeIssue(
              frame.frameIdx,
              "low-confidence",
              [point.name],
              `${point.name} confidence ${point.score.toFixed(2)} is below ${confidenceThreshold.toFixed(2)}`,
              0.35 + shortfall * 0.65,
              options,
              { value: point.score, reference: confidenceThreshold },
            ),
          );
        }
      }
    }

    for (const edge of edges) {
      const reference = boneReferences[edgeKey(edge)];
      const source = frame.points[edge.source];
      const destination = frame.points[edge.destination];
      if (!reference || !usablePoint(source) || !usablePoint(destination)) continue;
      const length = pointDistance(source, destination);
      const deviation = Math.abs(length - reference) / reference;
      if (deviation > boneTolerance) {
        issues.push(
          makeIssue(
            frame.frameIdx,
            "bone-length",
            [edge.source, edge.destination],
            `${edge.source} → ${edge.destination} length drift ${(deviation * 100).toFixed(0)}%`,
            deviation / (boneTolerance * 2),
            options,
            { value: length, reference },
          ),
        );
      }
    }

    if (gripLimit !== null) {
      for (const [handName, gripName] of chooseGripPairs(frame, roles)) {
        const hand = frame.points[handName];
        const grip = frame.points[gripName];
        if (!usablePoint(hand) || !usablePoint(grip)) continue;
        const distance = pointDistance(hand, grip);
        if (distance > gripLimit) {
          issues.push(
            makeIssue(
              frame.frameIdx,
              "grip-distance",
              [handName, gripName],
              `${handName} is ${distance.toFixed(1)} px from ${gripName}`,
              distance / (gripLimit * 2),
              options,
              { value: distance, reference: gripLimit },
            ),
          );
        }
      }
    }

    issues.sort((a, b) => b.severity - a.severity || a.id.localeCompare(b.id));
    return {
      frameIdx: frame.frameIdx,
      issues,
      actionableIssues: issues.filter((issue) => !issue.locked),
      minConfidence: scores.length > 0 ? Math.min(...scores) : null,
      missingCount: issues.filter((issue) => issue.type === "missing-point").length,
      boneAnomalyCount: issues.filter((issue) => issue.type === "bone-length").length,
    };
  });

  const queue = reports
    .filter((report) => report.actionableIssues.length > 0)
    .sort((a, b) => {
      const severityA = a.actionableIssues[0]?.severity ?? 0;
      const severityB = b.actionableIssues[0]?.severity ?? 0;
      return severityB - severityA || a.frameIdx - b.frameIdx;
    });

  return { frames: reports, queue, referenceBoneLengths: boneReferences, roles };
}

/** Next actionable frame in timeline order, wrapping at the end. */
export function nextMotionRigReviewFrame(
  report: MotionRigSequenceReport,
  currentFrameIdx: number,
): number | null {
  const indices = report.frames
    .filter((frame) => frame.actionableIssues.length > 0)
    .map((frame) => frame.frameIdx)
    .sort((a, b) => a - b);
  return indices.find((frameIdx) => frameIdx > currentFrameIdx) ?? indices[0] ?? null;
}
