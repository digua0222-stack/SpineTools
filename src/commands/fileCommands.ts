/**
 * File commands: New, Open, Save.
 *
 * Ports SLEAP's NewProject, OpenProject, SaveProject commands.
 */

import { Labels } from "@talmolab/sleap-io.js";
import { UpdateTopic } from "../types";
import type { Command } from "./types";
import type { CommandContext } from "./CommandContext";
import { loadProjectFromFile } from "../lib/loadProject";
import { toast } from "sonner";

/** Reset state to an empty project. */
export const NewProjectCommand: Command = {
  name: "NewProject",
  topics: [UpdateTopic.Project, UpdateTopic.Labels],
  execute(ctx: CommandContext) {
    // Check for unsaved changes before creating a new project
    if (ctx.state.hasChanges) {
      const confirmed = window.confirm(
        "You have unsaved changes. Creating a new project will discard them. Continue?"
      );
      if (!confirmed) return;
    }

    const labels = new Labels();
    ctx.state.setLabels(labels, undefined);
  },
};

/** Open a file dialog, load an SLP file, and set state. */
export const OpenProjectCommand: Command = {
  name: "OpenProject",
  topics: [],
  skipAutoSnapshot: true,
  async execute(ctx: CommandContext) {
    // Use the File System Access API if available, otherwise fall back to input element
    let file: File | undefined;

    if ("showOpenFilePicker" in window) {
      try {
        const [handle] = await (window as unknown as { showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker({
          types: [
            {
              description: "SLEAP Labels",
              accept: { "application/octet-stream": [".slp"] },
            },
          ],
          multiple: false,
        });
        file = await handle.getFile();
      } catch {
        // User cancelled the dialog
        return;
      }
    } else {
      // Fallback: create a hidden file input
      file = await new Promise<File | undefined>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".slp";
        input.onchange = () => resolve(input.files?.[0]);
        // Handle cancel by resolving undefined after a delay
        input.oncancel = () => resolve(undefined);
        input.click();
      });
    }

    if (!file) return;

    // Use the consolidated project loader
    await loadProjectFromFile(file);

    // OpenProject sets labels directly via loadProjectFromFile,
    // so we don't need to signal topics (setLabels handles it)
    void ctx;
  },
};

/** Save the project as JSON (browser download). */
export const SaveProjectCommand: Command = {
  name: "SaveProject",
  topics: [],
  execute(ctx: CommandContext) {
    const { labels, filename } = ctx.state;
    if (!labels) return;

    try {
      const dict = labels.toDict();
      const json = JSON.stringify(dict, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const baseName = filename
        ? filename.replace(/\.slp$/, "")
        : "labels";
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}.json`;
      a.click();
      URL.revokeObjectURL(url);

      ctx.state.clearChanges();
      toast.success("Project saved", {
        description: `${baseName}.json`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Failed to save project", { description: msg });
      console.error("[SaveProject] Failed to save:", err);
    }
  },
};

/** Export the current project as JSON (toDict() serialization). */
export const ExportJsonCommand: Command = {
  name: "ExportJson",
  topics: [],
  execute(ctx: CommandContext) {
    const { labels, filename } = ctx.state;
    if (!labels) return;

    try {
      const dict = labels.toDict();
      const json = JSON.stringify(dict, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const baseName = filename
        ? filename.replace(/\.slp$/, "")
        : "labels";
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("JSON exported", {
        description: `${baseName}.json`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Failed to export JSON", { description: msg });
      console.error("[ExportJson] Failed to export:", err);
    }
  },
};
