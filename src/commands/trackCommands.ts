/**
 * Track commands: track creation, assignment, and transposition.
 *
 * Ports SLEAP's AddTrack, SetSelectedInstanceTrack, TransposeInstances.
 */

import { Track } from "@talmolab/sleap-io.js";
import { UpdateTopic } from "../types";
import type { Command } from "./types";
import type { CommandContext } from "./CommandContext";

/** Create a new Track and assign it to the selected instance. */
export const AddTrack: Command = {
  name: "AddTrack",
  topics: [UpdateTopic.Tracks, UpdateTopic.Instance],
  execute(ctx: CommandContext) {
    const { labels, instance } = ctx.state;
    if (!labels || !instance) return;

    // Determine next track number
    const trackNumber = labels.tracks.length + 1;
    const track = new Track(`Track ${trackNumber}`);

    labels.tracks.push(track);
    instance.track = track;

    ctx.state.markChanged();
  },
};

/**
 * Assign an existing track to the selected instance.
 *
 * Params:
 *   trackIdx: number - index into labels.tracks
 */
export const SetInstanceTrack: Command = {
  name: "SetInstanceTrack",
  topics: [UpdateTopic.Tracks, UpdateTopic.Instance],
  execute(ctx: CommandContext, params?: Record<string, unknown>) {
    const { labels, instance } = ctx.state;
    if (!labels || !instance) return;

    const trackIdx = params?.trackIdx;
    if (typeof trackIdx !== "number") return;

    if (trackIdx < 0 || trackIdx >= labels.tracks.length) return;

    instance.track = labels.tracks[trackIdx];

    ctx.state.markChanged();
  },
};

/**
 * Swap tracks between two instances on the current frame.
 * The selected instance swaps with the next instance that has a different track.
 */
export const TransposeInstances: Command = {
  name: "TransposeInstances",
  topics: [UpdateTopic.Tracks, UpdateTopic.Instance],
  execute(ctx: CommandContext) {
    const { labels, video, frameIdx, instance } = ctx.state;
    if (!labels || !video || !instance) return;

    const frames = labels.labeledFrames.filter(
      (lf) => lf.video === video && lf.frameIdx === frameIdx
    );
    if (frames.length === 0) return;

    const lf = frames[0];
    const instances = lf.instances;

    // Find the selected instance's index
    const selectedIdx = instances.indexOf(instance);
    if (selectedIdx === -1) return;

    // Find the next instance with a different track to swap with
    // Wrap around if needed
    let otherIdx = -1;
    for (let i = 1; i < instances.length; i++) {
      const candidate = instances[(selectedIdx + i) % instances.length];
      if (candidate.track !== instance.track) {
        otherIdx = (selectedIdx + i) % instances.length;
        break;
      }
    }

    if (otherIdx === -1) return;

    // Swap tracks
    const tempTrack = instance.track;
    instance.track = instances[otherIdx].track;
    instances[otherIdx].track = tempTrack;

    ctx.state.markChanged();
  },
};

/** Copy the selected instance's track to the clipboard. */
export const CopyTrack: Command = {
  name: "CopyTrack",
  topics: [],
  execute(ctx: CommandContext) {
    const { instance } = ctx.state;
    if (!instance?.track) return;
    ctx.setState({ clipboardTrack: instance.track });
  },
};

/** Paste the clipboard track onto the selected instance. */
export const PasteTrack: Command = {
  name: "PasteTrack",
  topics: [UpdateTopic.Tracks, UpdateTopic.Instance],
  execute(ctx: CommandContext) {
    const { instance, clipboardTrack } = ctx.state;
    if (!instance || !clipboardTrack) return;
    instance.track = clipboardTrack;
    ctx.state.markChanged();
  },
};
