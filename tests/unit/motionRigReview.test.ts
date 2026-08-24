import { describe, expect, it } from "../bun-test";
import {
  analyzeMotionRigSequence,
  buildMotionRigFrames,
  buildMotionRigReviewManifest,
  inferMotionRigRoles,
  motionRigPointLockKey,
  nextMotionRigReviewFrame,
  parseMotionRigReviewState,
  setMotionRigFrameNote,
  setMotionRigPointLocked,
  type MotionRigFrame,
} from "@/lib/motionRigReview";

function frame(
  frameIdx: number,
  points: Record<
    string,
    { x: number; y: number; visible?: boolean; score?: number }
  >,
): MotionRigFrame {
  return {
    frameIdx,
    points: Object.fromEntries(
      Object.entries(points).map(([name, point]) => [
        name,
        {
          name,
          x: point.x,
          y: point.y,
          visible: point.visible ?? true,
          complete: false,
          ...(point.score === undefined ? {} : { score: point.score }),
        },
      ]),
    ),
  };
}

describe("buildMotionRigFrames", () => {
  it("selects the requested track and preserves point-level scores", () => {
    const result = buildMotionRigFrames(
      [
        {
          frameIdx: 8,
          instances: [
            {
              track: { name: "other" },
              points: [{ xy: [1, 2], score: 0.9 }],
              skeleton: { nodes: [{ name: "hand" }] },
            },
            {
              track: { name: "zhaoyun" },
              score: 0.7,
              points: [
                { xy: [12, 13], visible: true, complete: true, score: 0.23 },
                { xy: [20, 21], visible: true },
              ],
              skeleton: { nodes: [{ name: "hand" }, { name: "spear_tip" }] },
            },
          ],
        },
      ],
      ["hand", "spear_tip"],
      "zhaoyun",
    );

    expect(result).toHaveLength(1);
    expect(result[0].points.hand).toMatchObject({ x: 12, y: 13, score: 0.23 });
    expect(result[0].points.spear_tip.score).toBe(0.7);
  });

  it("treats editable points without model scores as confidence 1", () => {
    const result = buildMotionRigFrames(
      [{ frameIdx: 0, instances: [{ points: [{ xy: [1, 2] }] }] }],
      ["head"],
    );
    expect(result[0].points.head.score).toBe(1);
  });
});

describe("inferMotionRigRoles", () => {
  it("recognizes English and Chinese hand/weapon aliases", () => {
    expect(
      inferMotionRigRoles([
        "left_hand",
        "right_hand",
        "枪尖",
        "枪尾",
        "前握点",
        "后握点",
      ]),
    ).toEqual({
      leftHand: "left_hand",
      rightHand: "right_hand",
      weaponTip: "枪尖",
      weaponTail: "枪尾",
      frontGrip: "前握点",
      rearGrip: "后握点",
    });
  });
});

describe("analyzeMotionRigSequence", () => {
  it("ranks low-confidence points and removes fully locked issues from the queue", () => {
    const frames = [frame(3, { wrist: { x: 2, y: 4, score: 0.2 } })];
    const key = motionRigPointLockKey(3, "wrist", "zhaoyun");
    const unlocked = analyzeMotionRigSequence(frames, [], {
      confidenceThreshold: 0.5,
      boneLengthTolerance: 0.2,
      trackName: "zhaoyun",
    });
    expect(unlocked.queue.map((item) => item.frameIdx)).toEqual([3]);
    expect(unlocked.frames[0].issues[0].type).toBe("low-confidence");

    const locked = analyzeMotionRigSequence(frames, [], {
      confidenceThreshold: 0.5,
      boneLengthTolerance: 0.2,
      trackName: "zhaoyun",
      lockedPointKeys: new Set([key]),
    });
    expect(locked.frames[0].issues[0].locked).toBe(true);
    expect(locked.queue).toEqual([]);
  });

  it("detects bone length drift against a robust sequence median", () => {
    const frames = [
      frame(0, { hip: { x: 0, y: 0 }, knee: { x: 10, y: 0 } }),
      frame(1, { hip: { x: 0, y: 0 }, knee: { x: 10, y: 0 } }),
      frame(2, { hip: { x: 0, y: 0 }, knee: { x: 30, y: 0 } }),
    ];
    const report = analyzeMotionRigSequence(
      frames,
      [{ source: "hip", destination: "knee" }],
      { confidenceThreshold: 0.5, boneLengthTolerance: 0.2 },
    );
    expect(report.referenceBoneLengths["hip → knee"]).toBe(10);
    expect(report.frames[0].boneAnomalyCount).toBe(0);
    expect(report.frames[2].issues.some((issue) => issue.type === "bone-length")).toBe(true);
  });

  it("checks hand contact against inferred spear grip anchors", () => {
    const report = analyzeMotionRigSequence(
      [
        frame(0, {
          left_hand: { x: 50, y: 0 },
          right_hand: { x: 70, y: 0 },
          spear_tip: { x: 100, y: 0 },
          spear_tail: { x: 0, y: 0 },
          front_grip: { x: 30, y: 0 },
          rear_grip: { x: 70, y: 0 },
        }),
      ],
      [],
      { confidenceThreshold: 0.5, boneLengthTolerance: 0.2 },
    );
    const gripIssues = report.frames[0].issues.filter(
      (issue) => issue.type === "grip-distance",
    );
    expect(gripIssues).toHaveLength(1);
    expect(gripIssues[0].nodeNames).toEqual(["left_hand", "front_grip"]);
    expect(gripIssues[0].reference).toBe(8);
  });

  it("finds the next actionable frame in timeline order and wraps", () => {
    const report = analyzeMotionRigSequence(
      [
        frame(2, { node: { x: 0, y: 0, score: 0.1 } }),
        frame(9, { node: { x: 0, y: 0, score: 0.1 } }),
      ],
      [],
      { confidenceThreshold: 0.5, boneLengthTolerance: 0.2 },
    );
    expect(nextMotionRigReviewFrame(report, 2)).toBe(9);
    expect(nextMotionRigReviewFrame(report, 9)).toBe(2);
  });
});

describe("motion-rig review manifest", () => {
  it("round-trips locks and notes while rejecting malformed persisted data", () => {
    const initial = parseMotionRigReviewState(null);
    const key = motionRigPointLockKey(4, "front_hand");
    const updated = setMotionRigFrameNote(
      setMotionRigPointLocked(initial, key, true),
      4,
      "keep spear contact",
    );
    expect(parseMotionRigReviewState(JSON.stringify(updated))).toEqual(updated);
    expect(parseMotionRigReviewState("not-json").lockedPoints).toEqual([]);
  });

  it("exports a deterministic image-pixel contract", () => {
    const review = parseMotionRigReviewState(null);
    const manifest = buildMotionRigReviewManifest({
      videoId: "zhaoyun.mp4",
      nodeNames: ["hand", "spear_tip"],
      edges: [{ source: "hand", destination: "spear_tip" }],
      confidenceThreshold: 2,
      boneLengthTolerance: 0,
      roles: { weaponTip: "spear_tip" },
      review,
    });
    expect(manifest.schema).toBe("motion-rig-review@1");
    expect(manifest.coordinateSpace).toEqual({
      units: "image-pixels",
      origin: "top-left",
    });
    expect(manifest.settings).toEqual({
      confidenceThreshold: 1,
      boneLengthTolerance: 0.001,
    });
  });
});
