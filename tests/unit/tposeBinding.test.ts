import { describe, expect, it } from "../bun-test";
import {
  evaluateTPosBinding,
  inverseTPosTransform,
  parseTPosBindingManifest,
  solveTPosPart,
  stringifyTPosBindingManifest,
  summarizeTPosValidation,
  tposFallbackTransforms,
  transformTPosPoint,
  type TPosAffineMatrix,
  type TPosBindingManifest,
  type TPosPartBinding,
} from "@/lib/tposeBinding";

function part(overrides: Partial<TPosPartBinding> = {}): TPosPartBinding {
  return {
    id: "arm",
    name: "Front arm",
    rect: [10, 20, 80, 160],
    pivot: [0, 0],
    anchors: [
      { node: "shoulder", local: [0, 0] },
      { node: "wrist", local: [10, 0] },
    ],
    bone: "arm_front",
    slot: "body",
    z: 10,
    solve: "similarity-2d",
    ...overrides,
  };
}

function manifest(parts: readonly TPosPartBinding[]): TPosBindingManifest {
  return {
    schema: "tpose-bind/v1",
    atlas: {
      file: "tpose-detailed/atlas.png",
      width: 1024,
      height: 1024,
      transparent: true,
    },
    parts,
  };
}

describe("T-pose binding manifest", () => {
  it("parses and round-trips the portable schema", () => {
    const input: TPosBindingManifest = {
      schema: "tpose-bind/v1",
      atlas: {
        file: "tpose-detailed/atlas.png",
        width: 1024,
        height: 1024,
        background: "transparent",
        transparent: true,
      },
      settings: { scaleClamp: [0.75, 1.25] },
      parts: [
        part({
          driverNodes: ["shoulder", "elbow"],
          rotationOffset: -Math.PI / 2,
          scale: { fixed: 1, min: 0.8, max: 1.2 },
        }),
      ],
    };

    const parsed = parseTPosBindingManifest(JSON.stringify(input));
    expect(parsed).toEqual(input);
    expect(parseTPosBindingManifest(stringifyTPosBindingManifest(parsed))).toEqual(
      parsed,
    );
  });

  it("rejects invalid rectangles, scale bounds, and duplicate part ids", () => {
    expect(() =>
      parseTPosBindingManifest({
        ...manifest([part()]),
        parts: [part(), part()],
      }),
    ).toThrow(/duplicate id/);
    expect(() =>
      parseTPosBindingManifest(
        manifest([part({ rect: [0, 0, 0, 20] })]),
      ),
    ).toThrow(/greater than zero/);
    expect(() =>
      parseTPosBindingManifest(
        manifest([part({ rect: [-1, 0, 20, 20] })]),
      ),
    ).toThrow(/non-negative atlas coordinates/);
    expect(() =>
      parseTPosBindingManifest(
        manifest([part({ rect: [1000, 1000, 80, 160] })]),
      ),
    ).toThrow(/within atlas bounds/);
    expect(() =>
      parseTPosBindingManifest(
        manifest([part({ pivot: [81, 0] })]),
      ),
    ).toThrow(/within the cropped part/);
    expect(() =>
      parseTPosBindingManifest(
        manifest([part({ anchors: [{ node: "joint", local: [-1, 0] }] })]),
      ),
    ).toThrow(/within the cropped part/);
    expect(() =>
      parseTPosBindingManifest({
        ...manifest([part()]),
        settings: { scaleClamp: [2, 1] },
      }),
    ).toThrow(/min <= max/);
  });
});

describe("T-pose part retargeting", () => {
  it("translates a one-anchor component into image-pixel coordinates", () => {
    const solution = solveTPosPart(
      part({
        pivot: [5, 10],
        anchors: [{ node: "joint", local: [5, 10] }],
        solve: "translation",
      }),
      { joint: { x: 25, y: 40 } },
    );

    expect(solution.status).toBe("solved");
    expect(solution.transform.matrix.tx).toBeCloseTo(20, 8);
    expect(solution.transform.matrix.ty).toBeCloseTo(30, 8);
    expect(solution.transform.x).toBeCloseTo(25, 8);
    expect(solution.transform.y).toBeCloseTo(40, 8);
    expect(solution.rmse).toBeCloseTo(0, 8);
  });

  it("solves exact two-anchor rotation and uniform scale", () => {
    const solution = solveTPosPart(part({ pivot: [5, 0] }), {
      shoulder: { x: 100, y: 50 },
      wrist: { x: 100, y: 70 },
    });

    expect(solution.status).toBe("solved");
    expect(solution.transform.rotation).toBeCloseTo(Math.PI / 2, 8);
    expect(solution.transform.scaleX).toBeCloseTo(2, 8);
    expect(solution.transform.scaleY).toBeCloseTo(2, 8);
    expect(solution.transform.x).toBeCloseTo(100, 8);
    expect(solution.transform.y).toBeCloseTo(60, 8);
    expect(solution.maxError).toBeCloseTo(0, 8);
  });

  it("marks coincident target anchors as degraded instead of fully solved", () => {
    const solution = solveTPosPart(part(), {
      shoulder: { x: 25, y: 40 },
      wrist: { x: 25, y: 40 },
    });

    expect(solution.status).toBe("degraded");
    expect(solution.usedAnchorCount).toBe(2);
    expect(Object.values(solution.transform.matrix).every(Number.isFinite)).toBe(
      true,
    );
  });

  it("uses weighted least-squares similarity for three or more anchors", () => {
    const expected: TPosAffineMatrix = {
      a: Math.cos(Math.PI / 6) * 1.5,
      b: Math.sin(Math.PI / 6) * 1.5,
      c: -Math.sin(Math.PI / 6) * 1.5,
      d: Math.cos(Math.PI / 6) * 1.5,
      tx: 12,
      ty: -8,
    };
    const local = {
      a: [0, 0] as const,
      b: [2, 0] as const,
      c: [0, 3] as const,
      d: [4, 5] as const,
    };
    const anchors = Object.entries(local).map(([node, point], index) => ({
      node,
      local: point,
      weight: index === 3 ? 3 : 1,
    }));
    const points = Object.fromEntries(
      Object.entries(local).map(([node, point]) => [
        node,
        transformTPosPoint(expected, point),
      ]),
    );

    const solution = solveTPosPart(part({ anchors }), points);
    expect(solution.transform.matrix.a).toBeCloseTo(expected.a, 8);
    expect(solution.transform.matrix.b).toBeCloseTo(expected.b, 8);
    expect(solution.transform.matrix.tx).toBeCloseTo(expected.tx, 8);
    expect(solution.transform.matrix.ty).toBeCloseTo(expected.ty, 8);
    expect(solution.rmse).toBeCloseTo(0, 8);
  });

  it("clamps fitted stretch while preserving fitted rotation and centroid", () => {
    const solution = solveTPosPart(
      part({ scale: { max: 2 } }),
      {
        shoulder: { x: 0, y: 0 },
        wrist: { x: 100, y: 0 },
      },
    );

    expect(solution.transform.scaleX).toBeCloseTo(2, 8);
    expect(solution.transform.matrix.tx).toBeCloseTo(40, 8);
    expect(solution.anchors[0].predicted?.x).toBeCloseTo(40, 8);
    expect(solution.anchors[1].predicted?.x).toBeCloseTo(60, 8);
    expect(solution.rmse).toBeCloseTo(40, 8);
  });

  it("inherits driver-bone rotation for a single-anchor accessory", () => {
    const solution = solveTPosPart(
      part({
        id: "shoulder-pad",
        pivot: [0, 0],
        anchors: [{ node: "shoulder", local: [2, 0] }],
        driverNodes: ["shoulder", "elbow"],
        rotationOffset: 0,
        scale: { fixed: 1 },
      }),
      {
        shoulder: { x: 10, y: 10 },
        elbow: { x: 10, y: 30 },
      },
    );

    expect(solution.status).toBe("degraded");
    expect(solution.transform.rotation).toBeCloseTo(Math.PI / 2, 8);
    expect(solution.transform.matrix.tx).toBeCloseTo(10, 8);
    expect(solution.transform.matrix.ty).toBeCloseTo(8, 8);
    expect(solution.anchors[0].predicted).toMatchObject({ x: 10, y: 10 });
  });

  it("degrades on one visible anchor, falls back on zero, then marks unresolved", () => {
    const oneAnchor = solveTPosPart(part(), {
      shoulder: { x: 5, y: 7 },
      wrist: { x: 20, y: 20, visible: false },
    });
    expect(oneAnchor.status).toBe("degraded");
    expect(oneAnchor.usedAnchorCount).toBe(1);

    const fallback = solveTPosPart(part(), {}, {
      fallbackTransform: oneAnchor.transform,
    });
    expect(fallback.status).toBe("fallback");
    expect(fallback.transform).toEqual(oneAnchor.transform);
    expect(fallback.visible).toBe(true);

    const unresolved = solveTPosPart(part(), {});
    expect(unresolved.status).toBe("unresolved");
    expect(unresolved.visible).toBe(false);
    expect(unresolved.anchors.every((anchor) => anchor.predicted === null)).toBe(
      true,
    );
  });

  it("round-trips points through a solved transform and its inverse", () => {
    const solution = solveTPosPart(part(), {
      shoulder: { x: 30, y: -4 },
      wrist: { x: 40, y: 13.32050807568877 },
    });
    const inverse = inverseTPosTransform(solution.transform);
    expect(inverse).not.toBeNull();
    const local = { x: 4.25, y: 9.5 };
    const world = transformTPosPoint(solution.transform.matrix, local);
    const restored = transformTPosPoint(inverse!.matrix, world);
    expect(restored.x).toBeCloseTo(local.x, 8);
    expect(restored.y).toBeCloseTo(local.y, 8);
  });
});

describe("T-pose frame evaluation", () => {
  it("sorts deterministically, carries fallbacks, and reports reprojection error", () => {
    const parts = [
      part({ id: "z", slot: "same", z: 2 }),
      part({ id: "b", slot: "same", z: 1 }),
      part({ id: "a", slot: "same", z: 1 }),
    ];
    const first = evaluateTPosBinding(manifest(parts), 4, {
      shoulder: { x: 0, y: 0 },
      wrist: { x: 20, y: 0 },
    });
    expect(first.parts.map((item) => item.id)).toEqual(["a", "b", "z"]);

    const next = evaluateTPosBinding(manifest(parts), 5, {}, {
      fallbackTransforms: tposFallbackTransforms(first),
    });
    expect(next.parts.every((item) => item.status === "fallback")).toBe(true);

    const summary = summarizeTPosValidation(first, 0.001);
    expect(summary).toMatchObject({
      partCount: 3,
      resolvedPartCount: 3,
      unresolvedPartIds: [],
      measuredAnchorCount: 6,
      missingAnchorCount: 0,
      partsOverTolerance: [],
    });
    expect(summary.rmse).toBeCloseTo(0, 8);
  });
});
