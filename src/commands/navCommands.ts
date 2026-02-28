/**
 * Navigation commands: frame-level and suggestion-level navigation.
 *
 * Ports SLEAP's GoNextLabeledFrame, GoPrevLabeledFrame,
 * GoNextSuggestedFrame, GoPrevSuggestedFrame, GoFrameGui.
 */

import { UpdateTopic } from "../types";
import type { Command } from "./types";
import type { CommandContext } from "./CommandContext";

/** Navigate to the next frame that has labels (any instance). */
export const GoNextLabeledFrame: Command = {
  name: "GoNextLabeledFrame",
  topics: [UpdateTopic.Frame],
  execute(ctx: CommandContext) {
    const { labels, video, frameIdx } = ctx.state;
    if (!labels || !video) return;

    // Get all labeled frame indices for the current video, sorted
    const frameIndices = labels
      .find({ video })
      .map((lf) => lf.frameIdx)
      .sort((a, b) => a - b);

    if (frameIndices.length === 0) return;

    // Find the first frame index strictly greater than current
    const next = frameIndices.find((idx) => idx > frameIdx);
    if (next !== undefined) {
      ctx.state.setFrameIdx(next);
    } else {
      // Wrap around to the first labeled frame
      ctx.state.setFrameIdx(frameIndices[0]);
    }
  },
};

/** Navigate to the previous frame that has labels. */
export const GoPrevLabeledFrame: Command = {
  name: "GoPrevLabeledFrame",
  topics: [UpdateTopic.Frame],
  execute(ctx: CommandContext) {
    const { labels, video, frameIdx } = ctx.state;
    if (!labels || !video) return;

    const frameIndices = labels
      .find({ video })
      .map((lf) => lf.frameIdx)
      .sort((a, b) => a - b);

    if (frameIndices.length === 0) return;

    // Find the last frame index strictly less than current
    const prev = [...frameIndices].reverse().find((idx) => idx < frameIdx);
    if (prev !== undefined) {
      ctx.state.setFrameIdx(prev);
    } else {
      // Wrap around to the last labeled frame
      ctx.state.setFrameIdx(frameIndices[frameIndices.length - 1]);
    }
  },
};

/** Navigate to the next suggestion frame. */
export const GoNextSuggestion: Command = {
  name: "GoNextSuggestion",
  topics: [UpdateTopic.Frame, UpdateTopic.Suggestions],
  execute(ctx: CommandContext) {
    const { labels, video, frameIdx } = ctx.state;
    if (!labels || !video) return;

    // Filter suggestions for current video, sorted by frame index
    const suggestions = labels.suggestions
      .filter((s) => s.video === video)
      .sort((a, b) => a.frameIdx - b.frameIdx);

    if (suggestions.length === 0) return;

    const next = suggestions.find((s) => s.frameIdx > frameIdx);
    if (next) {
      ctx.state.setFrameIdx(next.frameIdx);
    } else {
      // Wrap around
      ctx.state.setFrameIdx(suggestions[0].frameIdx);
    }
  },
};

/** Navigate to the previous suggestion frame. */
export const GoPrevSuggestion: Command = {
  name: "GoPrevSuggestion",
  topics: [UpdateTopic.Frame, UpdateTopic.Suggestions],
  execute(ctx: CommandContext) {
    const { labels, video, frameIdx } = ctx.state;
    if (!labels || !video) return;

    const suggestions = labels.suggestions
      .filter((s) => s.video === video)
      .sort((a, b) => a.frameIdx - b.frameIdx);

    if (suggestions.length === 0) return;

    const prev = [...suggestions].reverse().find((s) => s.frameIdx < frameIdx);
    if (prev) {
      ctx.state.setFrameIdx(prev.frameIdx);
    } else {
      // Wrap around
      ctx.state.setFrameIdx(suggestions[suggestions.length - 1].frameIdx);
    }
  },
};

/** Navigate to a specific frame number. */
export const GoToFrame: Command = {
  name: "GoToFrame",
  topics: [UpdateTopic.Frame],
  execute(ctx: CommandContext, params?: Record<string, unknown>) {
    const frameIdx = params?.frameIdx;
    if (typeof frameIdx !== "number") return;
    ctx.state.setFrameIdx(frameIdx);
  },
};

/** Navigate to the last frame where the user interacted with an instance. */
export const GoToLastInteracted: Command = {
  name: "GoToLastInteracted",
  topics: [UpdateTopic.Frame],
  execute(ctx: CommandContext) {
    const { lastInteractedFrame } = ctx.state;
    if (lastInteractedFrame !== null) {
      ctx.state.setFrameIdx(lastInteractedFrame);
    }
  },
};

/** Navigate to the next frame with user-labeled (non-predicted) instances. */
export const GoNextUserFrame: Command = {
  name: "GoNextUserFrame",
  topics: [UpdateTopic.Frame],
  execute(ctx: CommandContext) {
    const { labels, video, frameIdx } = ctx.state;
    if (!labels || !video) return;

    const userFrames = labels
      .find({ video })
      .filter((lf) => lf.instances.some((i) => !("score" in i)))
      .map((lf) => lf.frameIdx)
      .sort((a, b) => a - b);

    if (userFrames.length === 0) return;

    const next = userFrames.find((idx) => idx > frameIdx);
    ctx.state.setFrameIdx(next !== undefined ? next : userFrames[0]);
  },
};
