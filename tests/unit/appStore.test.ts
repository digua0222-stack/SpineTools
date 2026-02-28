/**
 * Tests for the Zustand app store.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/stores/appStore";
import type { Labels, Video, Skeleton, Instance } from "@/types";

/** Helper to reset the store between tests. */
function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

/** Create a minimal mock Labels object. */
function mockLabels(overrides?: Partial<Labels>): Labels {
  return {
    videos: [],
    skeletons: [],
    labeledFrames: [],
    tracks: [],
    suggestions: [],
    provenance: {},
    find: () => [],
    append: () => {},
    ...overrides,
  } as unknown as Labels;
}

/** Create a minimal mock Video. */
function mockVideo(overrides?: Partial<Video>): Video {
  return {
    filename: "test.mp4",
    shape: [100, 480, 640, 3],
    backend: null,
    source_video: null,
    ...overrides,
  } as unknown as Video;
}

describe("appStore", () => {
  beforeEach(() => {
    resetStore();
  });

  it("has correct initial state", () => {
    const state = useAppStore.getState();

    expect(state.labels).toBeNull();
    expect(state.filename).toBeNull();
    expect(state.hasChanges).toBe(false);
    expect(state.projectLoaded).toBe(false);
    expect(state.video).toBeNull();
    expect(state.frameIdx).toBe(0);
    expect(state.instance).toBeNull();
    expect(state.labeledFrame).toBeNull();
    expect(state.skeleton).toBeNull();
    expect(state.showInstances).toBe(true);
    expect(state.showLabels).toBe(true);
    expect(state.showEdges).toBe(true);
    expect(state.edgeStyle).toBe("Line");
    expect(state.palette).toBe("standard");
    expect(state.markerSize).toBe(4);
    expect(state.debugMode).toBe(false);
  });

  describe("setLabels", () => {
    it("sets labels and marks project as loaded", () => {
      const labels = mockLabels();
      useAppStore.getState().setLabels(labels, "test.slp");

      const state = useAppStore.getState();
      expect(state.labels).toBe(labels);
      expect(state.filename).toBe("test.slp");
      expect(state.projectLoaded).toBe(true);
      expect(state.hasChanges).toBe(false);
    });

    it("sets first video and skeleton when available", () => {
      const video = mockVideo();
      const skeleton = { name: "test", nodes: [], edges: [] } as unknown as Skeleton;
      const labels = mockLabels({ videos: [video], skeletons: [skeleton] });

      useAppStore.getState().setLabels(labels);

      const state = useAppStore.getState();
      expect(state.video).toBe(video);
      expect(state.skeleton).toBe(skeleton);
    });

    it("resets frameIdx and instance on load", () => {
      // First set some state
      useAppStore.setState({ frameIdx: 10 });
      const labels = mockLabels();
      useAppStore.getState().setLabels(labels);

      const state = useAppStore.getState();
      expect(state.frameIdx).toBe(0);
      expect(state.instance).toBeNull();
    });

    it("allows null filename", () => {
      const labels = mockLabels();
      useAppStore.getState().setLabels(labels);

      expect(useAppStore.getState().filename).toBeNull();
    });
  });

  describe("setVideo", () => {
    it("sets the active video and resets frame/instance", () => {
      const video = mockVideo();
      useAppStore.setState({ frameIdx: 50 });
      useAppStore.getState().setVideo(video);

      const state = useAppStore.getState();
      expect(state.video).toBe(video);
      expect(state.frameIdx).toBe(0);
      expect(state.instance).toBeNull();
      expect(state.labeledFrame).toBeNull();
    });
  });

  describe("setFrameIdx", () => {
    it("sets frame index within bounds", () => {
      const video = mockVideo({ shape: [100, 480, 640, 3] });
      useAppStore.setState({ video });
      useAppStore.getState().setFrameIdx(50);

      expect(useAppStore.getState().frameIdx).toBe(50);
    });

    it("clamps to max frame", () => {
      const video = mockVideo({ shape: [100, 480, 640, 3] });
      useAppStore.setState({ video });
      useAppStore.getState().setFrameIdx(200);

      expect(useAppStore.getState().frameIdx).toBe(99);
    });

    it("clamps to zero for negative values", () => {
      const video = mockVideo({ shape: [100, 480, 640, 3] });
      useAppStore.setState({ video });
      useAppStore.getState().setFrameIdx(-5);

      expect(useAppStore.getState().frameIdx).toBe(0);
    });

    it("allows any non-negative index when video has no shape", () => {
      const video = mockVideo({ shape: null as unknown as Video["shape"] });
      useAppStore.setState({ video });
      useAppStore.getState().setFrameIdx(999);

      expect(useAppStore.getState().frameIdx).toBe(999);
    });

    it("clears instance and labeledFrame on frame change", () => {
      const video = mockVideo();
      useAppStore.setState({
        video,
        instance: {} as Instance,
        labeledFrame: {} as unknown as import("@/types").LabeledFrame,
      });
      useAppStore.getState().setFrameIdx(5);

      expect(useAppStore.getState().instance).toBeNull();
      expect(useAppStore.getState().labeledFrame).toBeNull();
    });
  });

  describe("incrementFrameIdx", () => {
    it("increments frame index by step", () => {
      const video = mockVideo({ shape: [100, 480, 640, 3] });
      useAppStore.setState({ video, frameIdx: 10 });
      useAppStore.getState().incrementFrameIdx(5);

      expect(useAppStore.getState().frameIdx).toBe(15);
    });

    it("wraps to 0 when going past max frame", () => {
      const video = mockVideo({ shape: [100, 480, 640, 3] });
      useAppStore.setState({ video, frameIdx: 99 });
      useAppStore.getState().incrementFrameIdx(1);

      expect(useAppStore.getState().frameIdx).toBe(0);
    });

    it("wraps to max frame when going below 0", () => {
      const video = mockVideo({ shape: [100, 480, 640, 3] });
      useAppStore.setState({ video, frameIdx: 0 });
      useAppStore.getState().incrementFrameIdx(-1);

      expect(useAppStore.getState().frameIdx).toBe(99);
    });

    it("does nothing when no video is set", () => {
      useAppStore.setState({ frameIdx: 5 });
      useAppStore.getState().incrementFrameIdx(1);

      expect(useAppStore.getState().frameIdx).toBe(5);
    });
  });

  describe("setInstance", () => {
    it("sets the selected instance", () => {
      const instance = { points: [] } as unknown as Instance;
      useAppStore.getState().setInstance(instance);

      expect(useAppStore.getState().instance).toBe(instance);
    });

    it("can clear the instance with null", () => {
      useAppStore.setState({ instance: {} as Instance });
      useAppStore.getState().setInstance(null);

      expect(useAppStore.getState().instance).toBeNull();
    });
  });

  describe("markChanged / clearChanges", () => {
    it("marks project as having changes", () => {
      useAppStore.getState().markChanged();
      expect(useAppStore.getState().hasChanges).toBe(true);
    });

    it("records the last interacted frame", () => {
      useAppStore.setState({ frameIdx: 42 });
      useAppStore.getState().markChanged();
      expect(useAppStore.getState().lastInteractedFrame).toBe(42);
    });

    it("clears changes flag", () => {
      useAppStore.setState({ hasChanges: true });
      useAppStore.getState().clearChanges();
      expect(useAppStore.getState().hasChanges).toBe(false);
    });
  });

  describe("toggle", () => {
    it("toggles boolean values", () => {
      expect(useAppStore.getState().showLabels).toBe(true);
      useAppStore.getState().toggle("showLabels");
      expect(useAppStore.getState().showLabels).toBe(false);
      useAppStore.getState().toggle("showLabels");
      expect(useAppStore.getState().showLabels).toBe(true);
    });

    it("does not change non-boolean values", () => {
      const before = useAppStore.getState().palette;
      useAppStore.getState().toggle("palette" as keyof import("@/stores/appStore").AppState);
      expect(useAppStore.getState().palette).toBe(before);
    });
  });

  describe("set", () => {
    it("sets arbitrary state values", () => {
      useAppStore.getState().set("palette", "alphabet");
      expect(useAppStore.getState().palette).toBe("alphabet");
    });

    it("sets numeric values", () => {
      useAppStore.getState().set("markerSize", 8);
      expect(useAppStore.getState().markerSize).toBe(8);
    });
  });
});
