/**
 * Predefined skeleton templates for common organisms.
 *
 * Each template defines nodes and edges that can be loaded into the skeleton
 * editor to quickly set up annotation for standard body plans.
 */

export interface SkeletonTemplate {
  name: string;
  description: string;
  nodes: string[];
  edges: [number, number][];
}

/** Drosophila melanogaster (fruit fly) — 32 nodes, top-down view. */
const fly: SkeletonTemplate = {
  name: "Fly (32 nodes)",
  description: "Drosophila melanogaster, top-down view",
  nodes: [
    "head",
    "eyeL",
    "eyeR",
    "neck",
    "thorax",
    "abdomen",
    "wingL",
    "wingR",
    "forelegL_coxa",
    "forelegL_femur",
    "forelegL_tibia",
    "forelegL_tarsus",
    "forelegR_coxa",
    "forelegR_femur",
    "forelegR_tibia",
    "forelegR_tarsus",
    "midlegL_coxa",
    "midlegL_femur",
    "midlegL_tibia",
    "midlegL_tarsus",
    "midlegR_coxa",
    "midlegR_femur",
    "midlegR_tibia",
    "midlegR_tarsus",
    "hindlegL_coxa",
    "hindlegL_femur",
    "hindlegL_tibia",
    "hindlegL_tarsus",
    "hindlegR_coxa",
    "hindlegR_femur",
    "hindlegR_tibia",
    "hindlegR_tarsus",
  ],
  edges: [
    [0, 1], // head -> eyeL
    [0, 2], // head -> eyeR
    [0, 3], // head -> neck
    [3, 4], // neck -> thorax
    [4, 5], // thorax -> abdomen
    [4, 6], // thorax -> wingL
    [4, 7], // thorax -> wingR
    // Foreleg L
    [3, 8],
    [8, 9],
    [9, 10],
    [10, 11],
    // Foreleg R
    [3, 12],
    [12, 13],
    [13, 14],
    [14, 15],
    // Midleg L
    [4, 16],
    [16, 17],
    [17, 18],
    [18, 19],
    // Midleg R
    [4, 20],
    [20, 21],
    [21, 22],
    [22, 23],
    // Hindleg L
    [4, 24],
    [24, 25],
    [25, 26],
    [26, 27],
    // Hindleg R
    [4, 28],
    [28, 29],
    [29, 30],
    [30, 31],
  ],
};

/** Mouse top-down view — 12 nodes. */
const mouseTopdown: SkeletonTemplate = {
  name: "Mouse top-down (12 nodes)",
  description: "Mouse, top-down view",
  nodes: [
    "nose",
    "earL",
    "earR",
    "spine1",
    "spine2",
    "spine3",
    "spine4",
    "tailBase",
    "tailTip",
    "forepawL",
    "forepawR",
    "hindpawL",
  ],
  edges: [
    [0, 1], // nose -> earL
    [0, 2], // nose -> earR
    [0, 3], // nose -> spine1
    [3, 4], // spine1 -> spine2
    [4, 5], // spine2 -> spine3
    [5, 6], // spine3 -> spine4
    [6, 7], // spine4 -> tailBase
    [7, 8], // tailBase -> tailTip
    [3, 9], // spine1 -> forepawL
    [3, 10], // spine1 -> forepawR
    [6, 11], // spine4 -> hindpawL
  ],
};

/** Human COCO-style keypoints — 17 nodes. */
const human: SkeletonTemplate = {
  name: "Human (17 nodes)",
  description: "COCO-style human keypoints",
  nodes: [
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
  ],
  edges: [
    [0, 1], // nose -> left_eye
    [0, 2], // nose -> right_eye
    [1, 3], // left_eye -> left_ear
    [2, 4], // right_eye -> right_ear
    [5, 6], // left_shoulder -> right_shoulder
    [5, 7], // left_shoulder -> left_elbow
    [7, 9], // left_elbow -> left_wrist
    [6, 8], // right_shoulder -> right_elbow
    [8, 10], // right_elbow -> right_wrist
    [5, 11], // left_shoulder -> left_hip
    [6, 12], // right_shoulder -> right_hip
    [11, 12], // left_hip -> right_hip
    [11, 13], // left_hip -> left_knee
    [13, 15], // left_knee -> left_ankle
    [12, 14], // right_hip -> right_knee
    [14, 16], // right_knee -> right_ankle
  ],
};

/** C. elegans — 2 nodes. */
const celegans: SkeletonTemplate = {
  name: "C. elegans (2 nodes)",
  description: "Caenorhabditis elegans, head and tail",
  nodes: ["head", "tail"],
  edges: [[0, 1]],
};

/** Empty/custom skeleton — 0 nodes. */
const custom: SkeletonTemplate = {
  name: "Custom (empty)",
  description: "Blank skeleton for custom body plan",
  nodes: [],
  edges: [],
};

/** All available skeleton templates keyed by ID. */
export const SKELETON_TEMPLATES: Record<string, SkeletonTemplate> = {
  fly,
  mouse_topdown: mouseTopdown,
  human,
  celegans,
  custom,
};

/** Ordered list of template IDs for UI display. */
export const TEMPLATE_ORDER = [
  "fly",
  "mouse_topdown",
  "human",
  "celegans",
  "custom",
] as const;
