/**
 * Edit commands: instance creation, deletion, copy/paste, and point manipulation.
 *
 * Ports SLEAP's AddInstance, DeleteSelectedInstance, CopyInstance, PasteInstance,
 * SetInstancePointLocations, DeleteFramePredictions.
 */

import { Instance, LabeledFrame } from "@talmolab/sleap-io.js";
import { UpdateTopic } from "../types";
import type { Command } from "./types";
import type { CommandContext } from "./CommandContext";

/** Create a new Instance on the current frame using Instance.empty(). */
export const AddInstance: Command = {
  name: "AddInstance",
  topics: [UpdateTopic.Frame, UpdateTopic.Instance],
  execute(ctx: CommandContext) {
    const { labels, video, frameIdx, skeleton } = ctx.state;
    if (!labels || !video || !skeleton) return;

    // Create an empty instance with NaN points
    const instance = Instance.empty({ skeleton });

    // Find or create the LabeledFrame for this video + frame
    let frames = labels.find({ video, frameIdx });
    let lf: LabeledFrame;
    if (frames.length > 0) {
      lf = frames[0];
    } else {
      lf = new LabeledFrame({ video, frameIdx });
      labels.append(lf);
    }

    lf.instances.push(instance);

    // Select the new instance and update state
    ctx.state.setLabeledFrame(lf);
    ctx.state.setInstance(instance);
    ctx.state.markChanged();
  },
};

/** Remove the currently selected instance from its frame. */
export const DeleteSelectedInstance: Command = {
  name: "DeleteSelectedInstance",
  topics: [UpdateTopic.Frame, UpdateTopic.Instance],
  execute(ctx: CommandContext) {
    const { labels, video, frameIdx, instance } = ctx.state;
    if (!labels || !video || !instance) return;

    const frames = labels.find({ video, frameIdx });
    if (frames.length === 0) return;

    const lf = frames[0];
    const idx = lf.instances.indexOf(instance);
    if (idx === -1) return;

    lf.instances.splice(idx, 1);

    // Clear selection
    ctx.state.setInstance(null);
    ctx.state.setLabeledFrame(lf.instances.length > 0 ? lf : null);
    ctx.state.markChanged();
  },
};

/**
 * Update a point's x,y coordinates on the selected instance.
 *
 * Params:
 *   nodeIdx: number - index of the node/point to update
 *   x: number - new x coordinate
 *   y: number - new y coordinate
 */
export const SetPointLocation: Command = {
  name: "SetPointLocation",
  topics: [], // No redraw topics - canvas handles this directly for drag perf
  execute(ctx: CommandContext, params?: Record<string, unknown>) {
    const { instance } = ctx.state;
    if (!instance) return;

    const nodeIdx = params?.nodeIdx;
    const x = params?.x;
    const y = params?.y;

    if (typeof nodeIdx !== "number" || typeof x !== "number" || typeof y !== "number") {
      return;
    }

    if (nodeIdx < 0 || nodeIdx >= instance.points.length) return;

    instance.points[nodeIdx].xy = [x, y];
    instance.points[nodeIdx].visible = true;
    instance.points[nodeIdx].complete = true;

    ctx.state.markChanged();
  },
};

/** Deep-copy a point array. */
function clonePoints(points: Instance["points"]): Instance["points"] {
  return points.map((p) => ({
    xy: [p.xy[0], p.xy[1]] as [number, number],
    visible: p.visible,
    complete: p.complete,
    name: p.name,
  }));
}

/** Copy the selected instance's point data to the clipboard. */
export const CopyInstance: Command = {
  name: "CopyInstance",
  topics: [],
  execute(ctx: CommandContext) {
    const { instance } = ctx.state;
    if (!instance) return;

    const clone = new Instance({
      skeleton: instance.skeleton,
      points: clonePoints(instance.points),
      track: instance.track,
    });
    ctx.setState({ clipboardInstance: clone });
  },
};

/** Paste the clipboard instance onto the current frame. */
export const PasteInstance: Command = {
  name: "PasteInstance",
  topics: [UpdateTopic.Frame, UpdateTopic.Instance],
  execute(ctx: CommandContext) {
    const { labels, video, frameIdx, clipboardInstance, skeleton } = ctx.state;
    if (!labels || !video || !clipboardInstance || !skeleton) return;

    const newInstance = new Instance({
      skeleton,
      points: clonePoints(clipboardInstance.points),
      track: clipboardInstance.track,
    });

    // Find or create the LabeledFrame
    let frames = labels.find({ video, frameIdx });
    let lf: LabeledFrame;
    if (frames.length > 0) {
      lf = frames[0];
    } else {
      lf = new LabeledFrame({ video, frameIdx });
      labels.append(lf);
    }

    lf.instances.push(newInstance);
    ctx.state.setLabeledFrame(lf);
    ctx.state.setInstance(newInstance);
    ctx.state.markChanged();
  },
};

/** Delete all predicted instances on the current frame. */
export const DeleteFramePredictions: Command = {
  name: "DeleteFramePredictions",
  topics: [UpdateTopic.Frame, UpdateTopic.Instance],
  execute(ctx: CommandContext) {
    const { labels, video, frameIdx, instance } = ctx.state;
    if (!labels || !video) return;

    const frames = labels.find({ video, frameIdx });
    if (frames.length === 0) return;

    const lf = frames[0];
    const userInstances = lf.instances.filter((inst) => !("score" in inst));
    lf.instances = userInstances;

    // If selected instance was predicted, deselect
    if (instance && "score" in instance) {
      ctx.state.setInstance(null);
    }
    ctx.state.setLabeledFrame(userInstances.length > 0 ? lf : null);
    ctx.state.markChanged();
  },
};

/** Delete all predicted instances across all frames. */
export const DeleteAllPredictions: Command = {
  name: "DeleteAllPredictions",
  topics: [UpdateTopic.Labels, UpdateTopic.Frame, UpdateTopic.Instance],
  execute(ctx: CommandContext) {
    const { labels, instance } = ctx.state;
    if (!labels) return;

    let removed = 0;
    for (const lf of labels.labeledFrames) {
      const before = lf.instances.length;
      lf.instances = lf.instances.filter((inst) => !("score" in inst));
      removed += before - lf.instances.length;
    }

    // Remove empty labeled frames
    labels.labeledFrames = labels.labeledFrames.filter(
      (lf) => lf.instances.length > 0
    );

    if (removed === 0) return;

    // If selected instance was predicted, deselect
    if (instance && "score" in instance) {
      ctx.state.setInstance(null);
    }
    ctx.state.markChanged();
  },
};
