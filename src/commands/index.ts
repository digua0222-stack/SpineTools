/**
 * Command system barrel export.
 *
 * Re-exports all command types, the CommandContext singleton,
 * and all command implementations.
 */

// Core
export type { Command } from "./types";
export { CommandContext, commandContext } from "./CommandContext";
export type { ChangeRecord } from "./CommandContext";

// File commands
export {
  NewProjectCommand,
  OpenProjectCommand,
  SaveProjectCommand,
  ExportJsonCommand,
} from "./fileCommands";

// Navigation commands
export {
  GoNextLabeledFrame,
  GoPrevLabeledFrame,
  GoNextSuggestion,
  GoPrevSuggestion,
  GoToFrame,
  GoToLastInteracted,
  GoNextUserFrame,
} from "./navCommands";

// Edit commands
export {
  AddInstance,
  DeleteSelectedInstance,
  SetPointLocation,
  CopyInstance,
  PasteInstance,
  DeleteFramePredictions,
  DeleteAllPredictions,
} from "./editCommands";

// Track commands
export {
  AddTrack,
  SetInstanceTrack,
  TransposeInstances,
  CopyTrack,
  PasteTrack,
} from "./trackCommands";
