/**
 * Main application state store.
 *
 * Mirrors SLEAP's GuiState pattern: a reactive key-value store with
 * subscriptions that trigger on value changes.
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  Labels,
  LabeledFrame,
  Instance,
  Skeleton,
  Track,
  Video,
  EdgeStyle,
  ColorTarget,
  InstancePlacementMethod,
} from "../types";

export interface AppState {
  // === Project state ===
  labels: Labels | null;
  filename: string | null;
  hasChanges: boolean;
  projectLoaded: boolean;

  // === Selection state ===
  video: Video | null;
  frameIdx: number;
  instance: Instance | null;
  labeledFrame: LabeledFrame | null;
  skeleton: Skeleton | null;
  lastInteractedFrame: number | null;

  // === View state ===
  showInstances: boolean;
  showLabels: boolean;
  showEdges: boolean;
  showNonVisibleNodes: boolean;
  edgeStyle: EdgeStyle;
  fit: boolean;
  fitSelection: boolean;
  colorPredicted: boolean;
  palette: string;
  distinctlyColor: ColorTarget;
  markerSize: number;
  nodeLabelSize: number;
  trailLength: number;
  trailShade: string;

  // === Editing state ===
  instanceInitMethod: InstancePlacementMethod;
  clipboardTrack: Track | null;
  clipboardInstance: Instance | null;

  // === Frame range ===
  frameRange: [number, number] | null;
  hasFrameRange: boolean;

  // === Debug ===
  debugMode: boolean;

  // === Actions ===
  setLabels: (labels: Labels, filename?: string) => void;
  setVideo: (video: Video) => void;
  setFrameIdx: (idx: number) => void;
  incrementFrameIdx: (step: number) => void;
  setInstance: (instance: Instance | null) => void;
  setLabeledFrame: (frame: LabeledFrame | null) => void;
  markChanged: () => void;
  clearChanges: () => void;
  toggle: (key: keyof AppState) => void;
  set: <K extends keyof AppState>(key: K, value: AppState[K]) => void;
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // Project state
      labels: null,
      filename: null,
      hasChanges: false,
      projectLoaded: false,

      // Selection state
      video: null,
      frameIdx: 0,
      instance: null,
      labeledFrame: null,
      skeleton: null,
      lastInteractedFrame: null,

      // View state
      showInstances: true,
      showLabels: true,
      showEdges: true,
      showNonVisibleNodes: true,
      edgeStyle: "Line" as EdgeStyle,
      fit: false,
      fitSelection: false,
      colorPredicted: false,
      palette: "standard",
      distinctlyColor: "instances" as ColorTarget,
      markerSize: 4,
      nodeLabelSize: 12,
      trailLength: 0,
      trailShade: "Normal",

      // Editing state
      instanceInitMethod: "best" as InstancePlacementMethod,
      clipboardTrack: null,
      clipboardInstance: null,

      // Frame range
      frameRange: null,
      hasFrameRange: false,

      // Debug
      debugMode: false,

      // Actions
      setLabels: (labels, filename) =>
        set((state) => {
          state.labels = labels;
          state.filename = filename ?? null;
          state.projectLoaded = true;
          state.hasChanges = false;

          // Set first video and skeleton
          if (labels.videos.length > 0) {
            state.video = labels.videos[0];
          }
          if (labels.skeletons.length > 0) {
            state.skeleton = labels.skeletons[0];
          }
          state.frameIdx = 0;
          state.instance = null;
          state.labeledFrame = null;
        }),

      setVideo: (video) =>
        set((state) => {
          state.video = video;
          state.frameIdx = 0;
          state.instance = null;
          state.labeledFrame = null;
        }),

      setFrameIdx: (idx) =>
        set((state) => {
          const video = state.video;
          if (video && video.shape) {
            const maxFrame = (video.shape[0] ?? 1) - 1;
            state.frameIdx = Math.max(0, Math.min(idx, maxFrame));
          } else {
            // No shape info — allow any non-negative index
            state.frameIdx = Math.max(0, idx);
          }
          state.instance = null;
          state.labeledFrame = null;
        }),

      incrementFrameIdx: (step) => {
        const { video, frameIdx } = get();
        if (!video) return;
        const maxFrame = video.shape ? (video.shape[0] ?? 1) - 1 : Infinity;
        let newIdx = frameIdx + step;
        if (maxFrame !== Infinity) {
          // Wrap around
          if (newIdx < 0) newIdx = maxFrame;
          if (newIdx > maxFrame) newIdx = 0;
        } else {
          if (newIdx < 0) newIdx = 0;
        }
        get().setFrameIdx(newIdx);
      },

      setInstance: (instance) =>
        set((state) => {
          state.instance = instance;
        }),

      setLabeledFrame: (frame) =>
        set((state) => {
          state.labeledFrame = frame;
        }),

      markChanged: () =>
        set((state) => {
          state.hasChanges = true;
          state.lastInteractedFrame = state.frameIdx;
        }),

      clearChanges: () =>
        set((state) => {
          state.hasChanges = false;
        }),

      toggle: (key) =>
        set((state) => {
          const val = state[key];
          if (typeof val === "boolean") {
            (state as Record<string, unknown>)[key] = !val;
          }
        }),

      set: (key, value) =>
        set((state) => {
          (state as Record<string, unknown>)[key] = value;
        }),
    }))
  )
);
