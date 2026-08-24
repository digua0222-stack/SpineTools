/**
 * Zhao Yun Motion Rig demo loader.
 *
 * The demo JSON is deliberately independent from SLEAP's binary SLP format so
 * a Python tracker, an AI service, or a hand-authored fixture can all emit the
 * same small interchange format. We convert it to normal SLEAP objects at the
 * UI boundary, which means the existing frame-accurate canvas, undo stack and
 * point editing tools work without a Spine installation.
 */

import {
  Instance,
  LabeledFrame,
  Labels,
  Skeleton,
  SuggestionFrame,
  Track,
  loadVideo,
  type Video,
} from "@talmolab/sleap-io.js";
import { useAppStore } from "@/stores/appStore";
import { toast } from "@/lib/notify";

export const ZHAOYUN_DEMO_JSON = "demo/zhaoyun/zhaoyun.motionrig.json";
export const ZHAOYUN_DEMO_VIDEO = "demo/zhaoyun/zhaoyun.mp4";
export const ZHAOYUN_DEMO_TPOSE = "demo/zhaoyun/tpose-detailed/atlas.png";
export const ZHAOYUN_DEMO_TPOSE_BINDING =
  "demo/zhaoyun/zhaoyun.tpose-bind.json";

export interface MotionRigPointData {
  x: number;
  y: number;
  confidence: number;
  visible: boolean;
  source?: string;
}

export interface MotionRigFrameData {
  frameIndex: number;
  score: number;
  points: Record<string, MotionRigPointData>;
}

export interface MotionRigProjectData {
  schemaVersion: string;
  project: string;
  video: {
    file: string;
    width: number;
    height: number;
    fps: number;
    frameCount: number;
  };
  skeleton: {
    nodes: string[];
    edges: [string, string][];
  };
  frames: MotionRigFrameData[];
  suggestions: number[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, at: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${at} must be an object`);
  }
  return value as UnknownRecord;
}

function finiteNumber(value: unknown, at: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${at} must be a finite number`);
  }
  return value;
}

function positiveNumber(value: unknown, at: string): number {
  const result = finiteNumber(value, at);
  if (result <= 0) throw new Error(`${at} must be positive`);
  return result;
}

function integer(value: unknown, at: string): number {
  const result = finiteNumber(value, at);
  if (!Number.isInteger(result)) throw new Error(`${at} must be an integer`);
  return result;
}

function stringValue(value: unknown, at: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${at} must be a non-empty string`);
  }
  return value;
}

function pick(source: UnknownRecord, camel: string, snake?: string): unknown {
  return source[camel] ?? (snake ? source[snake] : undefined);
}

/** Parse and validate a Motion Rig interchange document. */
export function parseMotionRigProject(input: unknown): MotionRigProjectData {
  const root = record(input, "project");
  const video = record(root.video, "video");
  const skeleton = record(root.skeleton, "skeleton");
  const projectMetadata =
    typeof root.project === "object" && root.project !== null && !Array.isArray(root.project)
      ? record(root.project, "project.project")
      : null;

  const rawNodes = skeleton.nodes;
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    throw new Error("skeleton.nodes must be a non-empty array");
  }
  const nodes = rawNodes.map((entry, index) => {
    if (typeof entry === "string") return stringValue(entry, `skeleton.nodes[${index}]`);
    return stringValue(record(entry, `skeleton.nodes[${index}]`).name, `skeleton.nodes[${index}].name`);
  });
  if (new Set(nodes).size !== nodes.length) {
    throw new Error("skeleton.nodes contains duplicate names");
  }

  const rawEdges = skeleton.edges;
  if (!Array.isArray(rawEdges)) throw new Error("skeleton.edges must be an array");
  const edges = rawEdges.map((entry, index): [string, string] => {
    if (Array.isArray(entry) && entry.length === 2) {
      return [
        stringValue(entry[0], `skeleton.edges[${index}][0]`),
        stringValue(entry[1], `skeleton.edges[${index}][1]`),
      ];
    }
    const edge = record(entry, `skeleton.edges[${index}]`);
    return [
      stringValue(edge.parent, `skeleton.edges[${index}].parent`),
      stringValue(edge.child, `skeleton.edges[${index}].child`),
    ];
  });
  const nodeSet = new Set(nodes);
  for (const [parent, child] of edges) {
    if (!nodeSet.has(parent) || !nodeSet.has(child)) {
      throw new Error(`skeleton edge references an unknown node: ${parent} -> ${child}`);
    }
  }

  const width = integer(video.width, "video.width");
  const height = integer(video.height, "video.height");
  const frameCount = integer(pick(video, "frameCount", "frame_count"), "video.frameCount");
  const fps = positiveNumber(video.fps, "video.fps");
  if (width <= 0 || height <= 0 || frameCount <= 0) {
    throw new Error("video dimensions and frame count must be positive");
  }

  const rawFrames = root.frames;
  if (!Array.isArray(rawFrames) || rawFrames.length === 0) {
    throw new Error("frames must be a non-empty array");
  }
  const seenFrames = new Set<number>();
  const frames = rawFrames.map((entry, index): MotionRigFrameData => {
    const frame = record(entry, `frames[${index}]`);
    const frameIndex = integer(
      pick(frame, "frameIndex", "frame_index"),
      `frames[${index}].frameIndex`,
    );
    if (frameIndex < 0 || frameIndex >= frameCount) {
      throw new Error(`frames[${index}].frameIndex is outside the video`);
    }
    if (seenFrames.has(frameIndex)) throw new Error(`duplicate frame index ${frameIndex}`);
    seenFrames.add(frameIndex);

    const rawPoints = record(frame.points, `frames[${index}].points`);
    const points: Record<string, MotionRigPointData> = {};
    for (const name of nodes) {
      const point = record(rawPoints[name], `frames[${index}].points.${name}`);
      const x = finiteNumber(point.x, `frames[${index}].points.${name}.x`);
      const y = finiteNumber(point.y, `frames[${index}].points.${name}.y`);
      const confidence = finiteNumber(
        point.confidence ?? point.score,
        `frames[${index}].points.${name}.confidence`,
      );
      if (x < 0 || x >= width || y < 0 || y >= height) {
        throw new Error(`frames[${index}].points.${name} is outside the image`);
      }
      if (confidence < 0 || confidence > 1) {
        throw new Error(`frames[${index}].points.${name}.confidence must be in [0, 1]`);
      }
      points[name] = {
        x,
        y,
        confidence,
        visible: point.visible !== false,
        source: typeof point.source === "string" ? point.source : undefined,
      };
    }
    const scoreValue = frame.score ?? Math.min(...Object.values(points).map((p) => p.confidence));
    const score = finiteNumber(scoreValue, `frames[${index}].score`);
    if (score < 0 || score > 1) throw new Error(`frames[${index}].score must be in [0, 1]`);
    return { frameIndex, score, points };
  });
  frames.sort((a, b) => a.frameIndex - b.frameIndex);

  const rawSuggestions = root.suggestions ?? root.lowConfidenceFrames ?? root.low_confidence_frames ?? [];
  if (!Array.isArray(rawSuggestions)) throw new Error("suggestions must be an array");
  const suggestions = [...new Set(rawSuggestions.map((value, index) => {
    const item = typeof value === "object" && value !== null
      ? pick(record(value, `suggestions[${index}]`), "frameIndex", "frame_index")
      : value;
    const frameIndex = integer(item, `suggestions[${index}]`);
    if (frameIndex < 0 || frameIndex >= frameCount) {
      throw new Error(`suggestions[${index}] is outside the video`);
    }
    return frameIndex;
  }))].sort((a, b) => a - b);

  return {
    schemaVersion: String(pick(root, "schemaVersion", "schema_version") ?? "motionrig-1"),
    project: String(
      projectMetadata?.title ??
        projectMetadata?.id ??
        root.project ??
        root.name ??
        "Zhao Yun Motion Rig Demo",
    ),
    video: {
      file: String(video.file ?? video.filename ?? "zhaoyun.mp4"),
      width,
      height,
      fps,
      frameCount,
    },
    skeleton: { nodes, edges },
    frames,
    suggestions,
  };
}

/** Convert validated interchange data to the editor's native Labels graph. */
export function createLabelsFromMotionRig(project: MotionRigProjectData, video: Video): Labels {
  const skeleton = new Skeleton({ nodes: project.skeleton.nodes, name: "zhaoyun-motion-rig" });
  const byName = new Map(skeleton.nodes.map((node) => [node.name, node]));
  for (const [parentName, childName] of project.skeleton.edges) {
    const parent = byName.get(parentName);
    const child = byName.get(childName);
    if (!parent || !child) throw new Error(`Unknown skeleton edge ${parentName} -> ${childName}`);
    skeleton.addEdge(parent, child);
  }

  // Explicit metadata is also useful in unit tests and is a fallback if a
  // runtime decoder cannot report its shape immediately.
  video.shape = [
    project.video.frameCount,
    project.video.height,
    project.video.width,
    3,
  ];
  video.fps = project.video.fps;

  const track = new Track("zhaoyun");
  const labeledFrames = project.frames.map((frame) => {
    const points = project.skeleton.nodes.map((name) => {
      const point = frame.points[name];
      return {
        xy: [point.x, point.y] as [number, number],
        visible: point.visible,
        complete: true,
        name,
        score: point.confidence,
      };
    });
    // A normal Instance is intentional: these are machine-seeded points but
    // the Motion Rig workflow is correction-first, so users can drag a point
    // immediately. The per-point prediction score is retained for review.
    const instance = new Instance({ skeleton, points, track });
    return new LabeledFrame({ video, frameIdx: frame.frameIndex, instances: [instance] });
  });

  return new Labels({
    videos: [video],
    skeletons: [skeleton],
    tracks: [track],
    labeledFrames,
    suggestions: project.suggestions.map(
      (frameIdx) => new SuggestionFrame({ video, frameIdx, group: "motion-rig-review" }),
    ),
  });
}

function publicUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${relativePath.replace(/^\//, "")}`;
}

function installMotionRigProject(
  project: MotionRigProjectData,
  video: Video,
  filename: string,
): Labels {
  const store = useAppStore.getState();
  const labels = createLabelsFromMotionRig(project, video);
  store.setLabels(labels, filename);
  const firstFrame = labels.labeledFrames[0] ?? null;
  if (firstFrame) {
    store.setFrameIdx(firstFrame.frameIdx);
    store.setLabeledFrame(firstFrame);
    store.setInstance(firstFrame.instances[0] ?? null);
  }
  store.openPanel("motion-rig");
  return labels;
}

/**
 * Load a portable Motion Rig JSON plus its local video and optional T-Pose.
 * This is the reusable path for outputs from a different tracker/AI service;
 * the bundled Zhao Yun button below is only a zero-setup example.
 */
export async function loadMotionRigFiles(
  projectFile: File,
  videoFile: File,
  referenceFile?: File,
): Promise<void> {
  const store = useAppStore.getState();
  store.setLoading(true, "Reading Motion Rig project…", 10);
  try {
    const project = parseMotionRigProject(JSON.parse(await projectFile.text()));
    store.setLoading(true, "Opening selected video…", 45);
    const video = await loadVideo(videoFile);
    if (referenceFile) {
      video.backendMetadata.motionRigReferenceUrl = URL.createObjectURL(referenceFile);
      video.backendMetadata.motionRigReferenceName = referenceFile.name;
    }
    video.backendMetadata.motionRigProject = project.project;
    store.setLoading(true, "Building editable landmarks…", 80);
    installMotionRigProject(project, video, projectFile.name.replace(/\.json$/i, ".slp"));
    toast.success("Motion Rig project loaded", {
      description: `${project.frames.length} editable frames · ${project.skeleton.nodes.length} points${referenceFile ? " · reference image attached" : ""}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.error("Could not import Motion Rig files", { description: message });
    throw error;
  } finally {
    useAppStore.getState().setLoading(false);
  }
}

/** Fetch and open the bundled Zhao Yun demo, then focus the Motion Rig panel. */
export async function loadZhaoyunDemo(): Promise<void> {
  const store = useAppStore.getState();
  store.setLoading(true, "Loading Zhao Yun Motion Rig demo…", 10);
  try {
    const response = await fetch(publicUrl(ZHAOYUN_DEMO_JSON));
    if (!response.ok) throw new Error(`Demo JSON request failed (${response.status})`);
    const project = parseMotionRigProject(await response.json());
    store.setLoading(true, "Opening demo video…", 45);
    const video = await loadVideo(publicUrl(ZHAOYUN_DEMO_VIDEO));
    video.backendMetadata.motionRigReferenceUrl = publicUrl(ZHAOYUN_DEMO_TPOSE);
    video.backendMetadata.motionRigReferenceName = "Zhao Yun detailed 23-part T-Pose";
    video.backendMetadata.motionRigTposeBindingUrl = publicUrl(
      ZHAOYUN_DEMO_TPOSE_BINDING,
    );
    video.backendMetadata.motionRigProject = project.project;
    store.setLoading(true, "Building editable landmarks…", 80);
    installMotionRigProject(project, video, "zhaoyun.motionrig.slp");
    toast.success("Zhao Yun demo loaded", {
      description: `${project.frames.length} editable frames · ${project.skeleton.nodes.length} points · 23 bound T-Pose parts`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.error("Could not load Zhao Yun demo", { description: message });
    throw error;
  } finally {
    useAppStore.getState().setLoading(false);
  }
}
