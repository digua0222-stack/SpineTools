/**
 * CommandContext - central command executor with undo/redo.
 *
 * Mirrors SLEAP's CommandContext pattern: a single entry point for executing
 * commands that mutate the data model and signal which parts of the UI need
 * to update. Includes frame-level undo/redo via instance snapshots.
 */

import { Instance } from "@talmolab/sleap-io.js";
import { useAppStore, type AppState } from "../stores/appStore";
import type { UpdateTopic, Track } from "../types";
import type { Command } from "./types";

/** Record of an executed command for change tracking. */
export interface ChangeRecord {
  commandName: string;
  topics: UpdateTopic[];
  timestamp: number;
}

/** Snapshot of frame state for undo/redo. */
interface FrameSnapshot {
  commandName: string;
  videoRef: unknown; // Video reference
  frameIdx: number;
  /** Cloned instances before the command ran (null = no LabeledFrame existed). */
  instances: Instance[] | null;
  /** Tracks array snapshot (by reference, order matters). */
  tracks: Track[];
  /** Index of selected instance in the instances array, or -1. */
  selectedIdx: number;
}

/** Deep-clone an instance's points. */
function clonePoints(points: Instance["points"]): Instance["points"] {
  return points.map((p) => ({
    xy: [p.xy[0], p.xy[1]] as [number, number],
    visible: p.visible,
    complete: p.complete,
    name: p.name,
  }));
}

/** Deep-clone an array of instances (preserving skeleton/track references). */
function cloneInstances(instances: Instance[]): Instance[] {
  return instances.map((inst) => {
    const clone = new Instance({
      skeleton: inst.skeleton,
      points: clonePoints(inst.points),
      track: inst.track,
    });
    // Preserve predicted instance score if present
    if ("score" in inst) {
      (clone as unknown as Record<string, unknown>).score = (
        inst as unknown as Record<string, number>
      ).score;
    }
    return clone;
  });
}

/** Callbacks that can be registered to react to update topics. */
type UpdateListener = (topics: UpdateTopic[]) => void;

const MAX_UNDO_STACK = 100;

export class CommandContext {
  /** Stack of executed commands for change tracking. */
  private changeStack: ChangeRecord[] = [];

  /** Undo stack: snapshots of state before each mutating command. */
  private undoStack: FrameSnapshot[] = [];

  /** Redo stack: snapshots for redoing undone commands. */
  private redoStack: FrameSnapshot[] = [];

  /** Listeners notified when topics are signaled. */
  private listeners: Set<UpdateListener> = new Set();

  /** Take a snapshot of the current frame state. */
  private takeSnapshot(commandName: string): FrameSnapshot {
    const { labels, video, frameIdx, instance } = this.state;
    let instances: Instance[] | null = null;
    let selectedIdx = -1;

    if (labels && video) {
      const frames = labels.find({ video, frameIdx });
      if (frames.length > 0) {
        const lf = frames[0];
        instances = cloneInstances(lf.instances);
        if (instance) {
          selectedIdx = lf.instances.indexOf(instance);
        }
      }
    }

    return {
      commandName,
      videoRef: video,
      frameIdx,
      instances,
      tracks: labels ? [...labels.tracks] : [],
      selectedIdx,
    };
  }

  /** Restore state from a snapshot. Returns a snapshot of the state being replaced. */
  private restoreSnapshot(snapshot: FrameSnapshot): FrameSnapshot {
    const before = this.takeSnapshot(snapshot.commandName);
    const { labels } = this.state;
    if (!labels) return before;

    const video = snapshot.videoRef as AppState["video"];
    if (!video) return before;

    // Restore tracks
    labels.tracks = [...snapshot.tracks];

    // Find the labeled frame
    const frames = labels.find({ video, frameIdx: snapshot.frameIdx });

    if (snapshot.instances === null) {
      // No LabeledFrame should exist - remove if present
      if (frames.length > 0) {
        const idx = labels.labeledFrames.indexOf(frames[0]);
        if (idx !== -1) labels.labeledFrames.splice(idx, 1);
      }
      this.state.setLabeledFrame(null);
      this.state.setInstance(null);
    } else if (frames.length > 0) {
      // Restore instances on existing frame
      const lf = frames[0];
      lf.instances = cloneInstances(snapshot.instances);
      this.state.setLabeledFrame(lf);

      // Restore selection
      if (snapshot.selectedIdx >= 0 && snapshot.selectedIdx < lf.instances.length) {
        this.state.setInstance(lf.instances[snapshot.selectedIdx]);
      } else {
        this.state.setInstance(null);
      }
    }

    this.state.markChanged();
    return before;
  }

  /** Check if a command mutates data (has update topics). */
  private isMutating(command: Command): boolean {
    return command.topics.length > 0;
  }

  /** Execute a command, track the change, and signal updates. */
  async execute(
    command: Command,
    params?: Record<string, unknown>
  ): Promise<void> {
    // Snapshot before mutating commands for undo
    if (this.isMutating(command)) {
      const snapshot = this.takeSnapshot(command.name);
      this.undoStack.push(snapshot);
      if (this.undoStack.length > MAX_UNDO_STACK) {
        this.undoStack.shift();
      }
      // Clear redo stack on new action
      this.redoStack.length = 0;
    }

    await command.execute(this, params);

    // Track the change
    this.changeStack.push({
      commandName: command.name,
      topics: command.topics,
      timestamp: Date.now(),
    });

    // Signal which topics changed
    if (command.topics.length > 0) {
      this.signalUpdate(command.topics);
    }
  }

  /** Undo the last mutating command. Returns true if an undo was performed. */
  undo(): boolean {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;

    const redoSnapshot = this.restoreSnapshot(snapshot);
    this.redoStack.push(redoSnapshot);
    return true;
  }

  /** Redo the last undone command. Returns true if a redo was performed. */
  redo(): boolean {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return false;

    const undoSnapshot = this.restoreSnapshot(snapshot);
    this.undoStack.push(undoSnapshot);
    return true;
  }

  /** Check if undo is available. */
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Check if redo is available. */
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Get the name of the command that would be undone. */
  get undoCommandName(): string | null {
    return this.undoStack.length > 0
      ? this.undoStack[this.undoStack.length - 1].commandName
      : null;
  }

  /** Get the name of the command that would be redone. */
  get redoCommandName(): string | null {
    return this.redoStack.length > 0
      ? this.redoStack[this.redoStack.length - 1].commandName
      : null;
  }

  /** Notify listeners that specific topics have changed. */
  signalUpdate(topics: UpdateTopic[]): void {
    for (const listener of this.listeners) {
      listener(topics);
    }
  }

  /** Register a listener for update signals. */
  onUpdate(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Get the full change history. */
  getChangeStack(): ReadonlyArray<ChangeRecord> {
    return this.changeStack;
  }

  /** Direct access to the Zustand store's getState for reading. */
  get state(): AppState {
    return useAppStore.getState();
  }

  /** Direct access to the Zustand store's setState for writing. */
  setState(
    partial:
      | Partial<AppState>
      | ((state: AppState) => Partial<AppState>)
  ): void {
    useAppStore.setState(partial as Parameters<typeof useAppStore.setState>[0]);
  }
}

/** Singleton command context for the application. */
export const commandContext = new CommandContext();
