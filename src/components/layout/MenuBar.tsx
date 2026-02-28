/**
 * Application menu bar.
 *
 * Renders a desktop-style menu bar with File, Edit, Go, View, Labels, Tracks menus.
 * All actions are wired to the command system via CommandContext.
 */

import { useAppStore } from "../../stores/appStore";
import { modKey } from "../../lib/platform";
import {
  commandContext,
  NewProjectCommand,
  OpenProjectCommand,
  SaveProjectCommand,
  ExportJsonCommand,
  GoNextLabeledFrame,
  GoPrevLabeledFrame,
  GoNextSuggestion,
  GoPrevSuggestion,
  GoToLastInteracted,
  GoNextUserFrame,
  AddInstance,
  DeleteSelectedInstance,
  CopyInstance,
  PasteInstance,
  DeleteFramePredictions,
  DeleteAllPredictions,
  AddTrack,
  TransposeInstances,
  CopyTrack,
  PasteTrack,
} from "../../commands";
import { PALETTES } from "../../lib/colorPalettes";
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
  MenubarShortcut,
  MenubarLabel,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar";

export function MenuBar() {
  return (
    <Menubar className="h-8 rounded-none border-0 border-b border-border bg-card px-0 gap-0 shadow-none">
      <div className="px-3 font-bold text-xs text-primary flex items-center">
        SLEAP
      </div>
      <FileMenu />
      <EditMenu />
      <GoMenu />
      <ViewMenu />
      <LabelsMenu />
      <TracksMenu />
    </Menubar>
  );
}

function FileMenu() {
  const exec = (cmd: Parameters<typeof commandContext.execute>[0]) => {
    commandContext.execute(cmd);
  };

  return (
    <MenubarMenu>
      <MenubarTrigger className="px-3 h-8 text-xs rounded-none">File</MenubarTrigger>
      <MenubarContent>
        <MenubarItem onClick={() => exec(NewProjectCommand)}>
          New Project <MenubarShortcut>{modKey}+N</MenubarShortcut>
        </MenubarItem>
        <MenubarItem onClick={() => exec(OpenProjectCommand)}>
          Open Project... <MenubarShortcut>{modKey}+O</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={() => exec(SaveProjectCommand)}>
          Save <MenubarShortcut>{modKey}+S</MenubarShortcut>
        </MenubarItem>
        <MenubarItem disabled>
          Save As... <MenubarShortcut>{modKey}+Shift+S</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={() => exec(ExportJsonCommand)}>
          Export JSON...
        </MenubarItem>
        <MenubarItem disabled>Export Analysis CSV...</MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={() => window.close()}>
          Quit <MenubarShortcut>{modKey}+Q</MenubarShortcut>
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}

function EditMenu() {
  const exec = (cmd: Parameters<typeof commandContext.execute>[0]) => {
    commandContext.execute(cmd);
  };

  const undoLabel = commandContext.canUndo
    ? `Undo ${commandContext.undoCommandName}`
    : "Undo";
  const redoLabel = commandContext.canRedo
    ? `Redo ${commandContext.redoCommandName}`
    : "Redo";

  return (
    <MenubarMenu>
      <MenubarTrigger className="px-3 h-8 text-xs rounded-none">Edit</MenubarTrigger>
      <MenubarContent>
        <MenubarItem
          disabled={!commandContext.canUndo}
          onClick={() => commandContext.undo()}
        >
          {undoLabel} <MenubarShortcut>{modKey}+Z</MenubarShortcut>
        </MenubarItem>
        <MenubarItem
          disabled={!commandContext.canRedo}
          onClick={() => commandContext.redo()}
        >
          {redoLabel} <MenubarShortcut>{modKey}+Shift+Z</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={() => exec(CopyInstance)}>
          Copy Instance <MenubarShortcut>{modKey}+C</MenubarShortcut>
        </MenubarItem>
        <MenubarItem onClick={() => exec(PasteInstance)}>
          Paste Instance <MenubarShortcut>{modKey}+V</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={() => exec(AddInstance)}>
          Add Instance <MenubarShortcut>{modKey}+I</MenubarShortcut>
        </MenubarItem>
        <MenubarItem onClick={() => exec(DeleteSelectedInstance)}>
          Delete Instance <MenubarShortcut>{modKey}+Backspace</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={() => exec(DeleteFramePredictions)}>
          Delete Predictions on Current Frame
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}

function GoMenu() {
  const exec = (cmd: Parameters<typeof commandContext.execute>[0]) => {
    commandContext.execute(cmd);
  };

  return (
    <MenubarMenu>
      <MenubarTrigger className="px-3 h-8 text-xs rounded-none">Go</MenubarTrigger>
      <MenubarContent>
        <MenubarItem onClick={() => exec(GoNextLabeledFrame)}>
          Next Labeled Frame <MenubarShortcut>Alt+{"\u2192"}</MenubarShortcut>
        </MenubarItem>
        <MenubarItem onClick={() => exec(GoPrevLabeledFrame)}>
          Previous Labeled Frame <MenubarShortcut>Alt+{"\u2190"}</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={() => exec(GoNextSuggestion)}>
          Next Suggestion <MenubarShortcut>Space</MenubarShortcut>
        </MenubarItem>
        <MenubarItem onClick={() => exec(GoPrevSuggestion)}>
          Previous Suggestion <MenubarShortcut>Shift+Space</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={() => exec(GoToLastInteracted)}>
          Last Interacted Frame <MenubarShortcut>{modKey}+A</MenubarShortcut>
        </MenubarItem>
        <MenubarItem onClick={() => exec(GoNextUserFrame)}>
          Next User Labeled Frame <MenubarShortcut>{modKey}+U</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem
          onClick={() => {
            const { labels, video } = useAppStore.getState();
            if (!labels || !video) return;
            const idx = labels.videos.indexOf(video);
            const next = labels.videos[(idx + 1) % labels.videos.length];
            if (next) useAppStore.getState().setVideo(next);
          }}
        >
          Next Video <MenubarShortcut>Alt+Shift+{"\u2192"}</MenubarShortcut>
        </MenubarItem>
        <MenubarItem
          onClick={() => {
            const { labels, video } = useAppStore.getState();
            if (!labels || !video) return;
            const idx = labels.videos.indexOf(video);
            const prev =
              labels.videos[(idx - 1 + labels.videos.length) % labels.videos.length];
            if (prev) useAppStore.getState().setVideo(prev);
          }}
        >
          Previous Video <MenubarShortcut>Alt+Shift+{"\u2190"}</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem
          onClick={() => {
            const { labeledFrame, instance } = useAppStore.getState();
            if (!labeledFrame) return;
            const instances = labeledFrame.instances;
            if (instances.length === 0) return;
            if (!instance) {
              useAppStore.getState().setInstance(instances[0]);
            } else {
              const idx = instances.indexOf(instance);
              useAppStore
                .getState()
                .setInstance(instances[(idx + 1) % instances.length]);
            }
          }}
        >
          Select Next Instance <MenubarShortcut>`</MenubarShortcut>
        </MenubarItem>
        <MenubarItem
          onClick={() => useAppStore.getState().setInstance(null)}
        >
          Clear Selection <MenubarShortcut>Esc</MenubarShortcut>
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}

function ViewMenu() {
  const showInstances = useAppStore((s) => s.showInstances);
  const showLabels = useAppStore((s) => s.showLabels);
  const showEdges = useAppStore((s) => s.showEdges);
  const showNonVisibleNodes = useAppStore((s) => s.showNonVisibleNodes);
  const colorPredicted = useAppStore((s) => s.colorPredicted);
  const fit = useAppStore((s) => s.fit);
  const edgeStyle = useAppStore((s) => s.edgeStyle);
  const toggle = useAppStore((s) => s.toggle);
  const setVal = useAppStore((s) => s.set);

  return (
    <MenubarMenu>
      <MenubarTrigger className="px-3 h-8 text-xs rounded-none">View</MenubarTrigger>
      <MenubarContent>
        <MenubarCheckboxItem
          checked={fit}
          onCheckedChange={() => toggle("fit")}
        >
          Fit View to Instances
        </MenubarCheckboxItem>
        <MenubarSeparator />
        <MenubarCheckboxItem
          checked={colorPredicted}
          onCheckedChange={() => toggle("colorPredicted")}
        >
          Color Predicted Instances
        </MenubarCheckboxItem>
        <MenubarSeparator />
        <MenubarCheckboxItem
          checked={showInstances}
          onCheckedChange={() => toggle("showInstances")}
        >
          Show Instances
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={showNonVisibleNodes}
          onCheckedChange={() => toggle("showNonVisibleNodes")}
        >
          Show Non-Visible Nodes
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={showLabels}
          onCheckedChange={() => toggle("showLabels")}
        >
          Show Node Names
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={showEdges}
          onCheckedChange={() => toggle("showEdges")}
        >
          Show Edges
        </MenubarCheckboxItem>
        <MenubarSeparator />
        <MenubarSub>
          <MenubarSubTrigger className="text-sm">Edge Style</MenubarSubTrigger>
          <MenubarSubContent>
            <MenubarRadioGroup
              value={edgeStyle}
              onValueChange={(val) => setVal("edgeStyle", val as "Line" | "Wedge")}
            >
              <MenubarRadioItem value="Line">Line</MenubarRadioItem>
              <MenubarRadioItem value="Wedge">Wedge</MenubarRadioItem>
            </MenubarRadioGroup>
          </MenubarSubContent>
        </MenubarSub>
        <MenubarSeparator />
        <MenubarLabel className="text-xs text-muted-foreground">Node Size</MenubarLabel>
        <div className="flex items-center px-2 py-1 gap-2">
          <input
            type="range"
            min={1}
            max={12}
            value={useAppStore.getState().markerSize}
            onChange={(e) => setVal("markerSize", Number(e.target.value))}
            className="flex-1 h-1 accent-primary"
          />
          <span className="text-xs text-muted-foreground w-4 text-right">
            {useAppStore.getState().markerSize}
          </span>
        </div>
        <MenubarSeparator />
        <MenubarSub>
          <MenubarSubTrigger className="text-sm">Color Palette</MenubarSubTrigger>
          <MenubarSubContent>
            <MenubarRadioGroup
              value={useAppStore.getState().palette}
              onValueChange={(val) => setVal("palette", val)}
            >
              {Object.keys(PALETTES).map((name) => (
                <MenubarRadioItem key={name} value={name}>
                  {name}
                </MenubarRadioItem>
              ))}
            </MenubarRadioGroup>
          </MenubarSubContent>
        </MenubarSub>
      </MenubarContent>
    </MenubarMenu>
  );
}

function LabelsMenu() {
  const labels = useAppStore((s) => s.labels);
  const totalLabeled = labels?.labeledFrames.length ?? 0;
  const totalInstances =
    labels?.labeledFrames.reduce((sum, lf) => sum + lf.instances.length, 0) ?? 0;

  const exec = (cmd: Parameters<typeof commandContext.execute>[0]) => {
    commandContext.execute(cmd);
  };

  return (
    <MenubarMenu>
      <MenubarTrigger className="px-3 h-8 text-xs rounded-none">Labels</MenubarTrigger>
      <MenubarContent>
        <MenubarItem onClick={() => exec(AddInstance)}>
          Add Instance <MenubarShortcut>{modKey}+I</MenubarShortcut>
        </MenubarItem>
        <MenubarItem onClick={() => exec(DeleteSelectedInstance)}>
          Delete Instance <MenubarShortcut>{modKey}+Backspace</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={() => exec(DeleteFramePredictions)}>
          Delete Predictions on Current Frame
        </MenubarItem>
        <MenubarItem
          onClick={() => {
            if (confirm("Delete all predicted instances across all frames?")) {
              exec(DeleteAllPredictions);
            }
          }}
        >
          Delete All Predictions...
        </MenubarItem>
        <MenubarSeparator />
        <MenubarLabel className="text-xs text-muted-foreground font-normal">
          {totalLabeled} labeled frames, {totalInstances} instances
        </MenubarLabel>
      </MenubarContent>
    </MenubarMenu>
  );
}

function TracksMenu() {
  const exec = (cmd: Parameters<typeof commandContext.execute>[0]) => {
    commandContext.execute(cmd);
  };

  return (
    <MenubarMenu>
      <MenubarTrigger className="px-3 h-8 text-xs rounded-none">Tracks</MenubarTrigger>
      <MenubarContent>
        <MenubarItem onClick={() => exec(TransposeInstances)}>
          Transpose Instance Tracks <MenubarShortcut>{modKey}+T</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={() => exec(AddTrack)}>
          New Track <MenubarShortcut>{modKey}+0</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={() => exec(CopyTrack)}>
          Copy Instance Track <MenubarShortcut>{modKey}+Shift+C</MenubarShortcut>
        </MenubarItem>
        <MenubarItem onClick={() => exec(PasteTrack)}>
          Paste Instance Track <MenubarShortcut>{modKey}+Shift+V</MenubarShortcut>
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
