import { describe, expect, it } from "../bun-test";
import { Video } from "@talmolab/sleap-io.js";
import {
  createLabelsFromMotionRig,
  parseMotionRigProject,
} from "@/lib/zhaoyunDemo";

function fixture() {
  return {
    schemaVersion: "motionrig-1",
    project: "test",
    video: {
      file: "test.mp4",
      width: 100,
      height: 80,
      fps: 24,
      frameCount: 2,
    },
    skeleton: {
      nodes: [{ name: "root" }, { name: "hand" }],
      edges: [["root", "hand"]],
    },
    frames: [
      {
        frameIndex: 0,
        score: 0.75,
        points: {
          root: { x: 10, y: 20, confidence: 0.8, visible: true, source: "seed" },
          hand: { x: 30, y: 40, confidence: 0.7, visible: true, source: "flow" },
        },
      },
      {
        frame_index: 1,
        score: 0.65,
        points: {
          root: { x: 11, y: 21, confidence: 0.7, visible: true },
          hand: { x: 31, y: 41, score: 0.6, visible: false },
        },
      },
    ],
    suggestions: [{ frameIndex: 1 }],
  };
}

describe("parseMotionRigProject", () => {
  it("accepts the Python generator schema and normalizes it", () => {
    const project = parseMotionRigProject(fixture());
    expect(project.skeleton.nodes).toEqual(["root", "hand"]);
    expect(project.skeleton.edges).toEqual([["root", "hand"]]);
    expect(project.frames[1].frameIndex).toBe(1);
    expect(project.frames[1].points.hand.confidence).toBe(0.6);
    expect(project.suggestions).toEqual([1]);
  });

  it("rejects points outside the source image", () => {
    const data = fixture();
    data.frames[0].points.root.x = 100;
    expect(() => parseMotionRigProject(data)).toThrow("outside the image");
  });

  it("rejects edges that reference unknown nodes", () => {
    const data = fixture();
    data.skeleton.edges = [["root", "missing"]];
    expect(() => parseMotionRigProject(data)).toThrow("unknown node");
  });
});

describe("createLabelsFromMotionRig", () => {
  it("creates immediately editable instances while retaining point confidence", () => {
    const project = parseMotionRigProject(fixture());
    const video = new Video({ filename: "test.mp4", openBackend: false });
    const labels = createLabelsFromMotionRig(project, video);

    expect(labels.labeledFrames).toHaveLength(2);
    expect(labels.skeletons[0].nodes).toHaveLength(2);
    expect(labels.skeletons[0].edges).toHaveLength(1);
    expect(labels.suggestions.map((suggestion) => suggestion.frameIdx)).toEqual([1]);
    expect(labels.videos[0].shape).toEqual([2, 80, 100, 3]);
    const instance = labels.labeledFrames[0].instances[0];
    expect(instance.points[0].xy).toEqual([10, 20]);
    expect(instance.points[0].score).toBe(0.8);
    instance.points[0].xy = [12, 22];
    expect(instance.points[0].xy).toEqual([12, 22]);
  });
});
