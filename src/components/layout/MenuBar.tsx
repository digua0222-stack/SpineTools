/**
 * Application menu bar.
 *
 * Renders a desktop-style menu bar with File, Go, View, Labels, Tracks menus.
 * All actions are wired to the command system via CommandContext.
 */

import { useState, useEffect, useCallback } from "react";
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


export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const closeMenu = useCallback(() => setOpenMenu(null), []);

  useEffect(() => {
    if (openMenu) {
      const handler = () => closeMenu();
      window.addEventListener("click", handler);
      return () => window.removeEventListener("click", handler);
    }
  }, [openMenu, closeMenu]);

  return (
    <div className="flex items-center h-8 bg-[var(--color-sleap-surface)] border-b border-[var(--color-sleap-border)] shrink-0 select-none">
      <div className="px-3 font-bold text-xs text-[var(--color-sleap-primary)]">
        SLEAP
      </div>
      <MenuButton label="File" id="file" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <FileMenu onClose={closeMenu} />
      </MenuButton>
      <MenuButton label="Edit" id="edit" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <EditMenu onClose={closeMenu} />
      </MenuButton>
      <MenuButton label="Go" id="go" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <GoMenu onClose={closeMenu} />
      </MenuButton>
      <MenuButton label="View" id="view" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <ViewMenu onClose={closeMenu} />
      </MenuButton>
      <MenuButton label="Labels" id="labels" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <LabelsMenu onClose={closeMenu} />
      </MenuButton>
      <MenuButton label="Tracks" id="tracks" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <TracksMenu onClose={closeMenu} />
      </MenuButton>
    </div>
  );
}

function MenuButton({
  label,
  id,
  openMenu,
  setOpenMenu,
  children,
}: {
  label: string;
  id: string;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  children: React.ReactNode;
}) {
  const isOpen = openMenu === id;
  return (
    <div className="relative">
      <button
        className={`px-3 h-8 text-xs transition-colors ${
          isOpen
            ? "bg-[var(--color-sleap-border)] text-white"
            : "text-[var(--color-sleap-text)] hover:bg-[var(--color-sleap-border)]"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          setOpenMenu(isOpen ? null : id);
        }}
        onMouseEnter={() => {
          if (openMenu !== null) setOpenMenu(id);
        }}
      >
        {label}
      </button>
      {isOpen && (
        <div
          className="absolute top-8 left-0 z-50 min-w-[220px] bg-[var(--color-sleap-surface)] border border-[var(--color-sleap-border)] rounded shadow-lg py-1"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// === Menu item components ===

function MenuItem({
  label,
  shortcut,
  onClick,
  disabled,
}: {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`w-full flex items-center justify-between px-3 py-1 text-xs text-left ${
        disabled
          ? "text-[var(--color-sleap-text-muted)] cursor-default"
          : "text-[var(--color-sleap-text)] hover:bg-[var(--color-sleap-border)]"
      }`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <span>{label}</span>
      {shortcut && (
        <span className="text-[var(--color-sleap-text-muted)] ml-4 text-[10px]">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function MenuCheckItem({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      className="w-full flex items-center px-3 py-1 text-xs text-left text-[var(--color-sleap-text)] hover:bg-[var(--color-sleap-border)]"
      onClick={onChange}
    >
      <span className="w-4 text-center">{checked ? "\u2713" : ""}</span>
      <span className="ml-1">{label}</span>
    </button>
  );
}

function MenuSeparator() {
  return <div className="my-1 border-t border-[var(--color-sleap-border)]" />;
}

// === Menu content ===

function FileMenu({ onClose }: { onClose: () => void }) {
  const exec = (cmd: Parameters<typeof commandContext.execute>[0]) => {
    onClose();
    commandContext.execute(cmd);
  };

  return (
    <>
      <MenuItem label="New Project" shortcut={`${modKey}+N`} onClick={() => exec(NewProjectCommand)} />
      <MenuItem label="Open Project..." shortcut={`${modKey}+O`} onClick={() => exec(OpenProjectCommand)} />
      <MenuSeparator />
      <MenuItem label="Save" shortcut={`${modKey}+S`} onClick={() => exec(SaveProjectCommand)} />
      <MenuItem label="Save As..." shortcut={`${modKey}+Shift+S`} disabled />
      <MenuSeparator />
      <MenuItem label="Export JSON..." onClick={() => exec(ExportJsonCommand)} />
      <MenuItem label="Export Analysis CSV..." disabled />
      <MenuSeparator />
      <MenuItem label="Quit" shortcut={`${modKey}+Q`} onClick={() => { onClose(); window.close(); }} />
    </>
  );
}

function EditMenu({ onClose }: { onClose: () => void }) {
  const exec = (cmd: Parameters<typeof commandContext.execute>[0]) => {
    onClose();
    commandContext.execute(cmd);
  };

  const undoLabel = commandContext.canUndo
    ? `Undo ${commandContext.undoCommandName}`
    : "Undo";
  const redoLabel = commandContext.canRedo
    ? `Redo ${commandContext.redoCommandName}`
    : "Redo";

  return (
    <>
      <MenuItem
        label={undoLabel}
        shortcut={`${modKey}+Z`}
        disabled={!commandContext.canUndo}
        onClick={() => {
          onClose();
          commandContext.undo();
        }}
      />
      <MenuItem
        label={redoLabel}
        shortcut={`${modKey}+Shift+Z`}
        disabled={!commandContext.canRedo}
        onClick={() => {
          onClose();
          commandContext.redo();
        }}
      />
      <MenuSeparator />
      <MenuItem label="Copy Instance" shortcut={`${modKey}+C`} onClick={() => exec(CopyInstance)} />
      <MenuItem label="Paste Instance" shortcut={`${modKey}+V`} onClick={() => exec(PasteInstance)} />
      <MenuSeparator />
      <MenuItem label="Add Instance" shortcut={`${modKey}+I`} onClick={() => exec(AddInstance)} />
      <MenuItem label="Delete Instance" shortcut={`${modKey}+Backspace`} onClick={() => exec(DeleteSelectedInstance)} />
      <MenuSeparator />
      <MenuItem label="Delete Predictions on Current Frame" onClick={() => exec(DeleteFramePredictions)} />
    </>
  );
}

function GoMenu({ onClose }: { onClose: () => void }) {
  const exec = (cmd: Parameters<typeof commandContext.execute>[0]) => {
    onClose();
    commandContext.execute(cmd);
  };

  return (
    <>
      <MenuItem label="Next Labeled Frame" shortcut="Alt+\u2192" onClick={() => exec(GoNextLabeledFrame)} />
      <MenuItem label="Previous Labeled Frame" shortcut="Alt+\u2190" onClick={() => exec(GoPrevLabeledFrame)} />
      <MenuSeparator />
      <MenuItem label="Next Suggestion" shortcut="Space" onClick={() => exec(GoNextSuggestion)} />
      <MenuItem label="Previous Suggestion" shortcut="Shift+Space" onClick={() => exec(GoPrevSuggestion)} />
      <MenuSeparator />
      <MenuItem label="Last Interacted Frame" shortcut={`${modKey}+A`} onClick={() => exec(GoToLastInteracted)} />
      <MenuItem label="Next User Labeled Frame" shortcut={`${modKey}+U`} onClick={() => exec(GoNextUserFrame)} />
      <MenuSeparator />
      <MenuItem
        label="Next Video"
        shortcut="Alt+Shift+\u2192"
        onClick={() => {
          onClose();
          const { labels, video } = useAppStore.getState();
          if (!labels || !video) return;
          const idx = labels.videos.indexOf(video);
          const next = labels.videos[(idx + 1) % labels.videos.length];
          if (next) useAppStore.getState().setVideo(next);
        }}
      />
      <MenuItem
        label="Previous Video"
        shortcut="Alt+Shift+\u2190"
        onClick={() => {
          onClose();
          const { labels, video } = useAppStore.getState();
          if (!labels || !video) return;
          const idx = labels.videos.indexOf(video);
          const prev = labels.videos[(idx - 1 + labels.videos.length) % labels.videos.length];
          if (prev) useAppStore.getState().setVideo(prev);
        }}
      />
      <MenuSeparator />
      <MenuItem
        label="Select Next Instance"
        shortcut="`"
        onClick={() => {
          onClose();
          const { labeledFrame, instance } = useAppStore.getState();
          if (!labeledFrame) return;
          const instances = labeledFrame.instances;
          if (instances.length === 0) return;
          if (!instance) {
            useAppStore.getState().setInstance(instances[0]);
          } else {
            const idx = instances.indexOf(instance);
            useAppStore.getState().setInstance(instances[(idx + 1) % instances.length]);
          }
        }}
      />
      <MenuItem
        label="Clear Selection"
        shortcut="Esc"
        onClick={() => { onClose(); useAppStore.getState().setInstance(null); }}
      />
    </>
  );
}

function ViewMenu({ onClose: _onClose }: { onClose: () => void }) {
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
    <>
      <MenuCheckItem label="Fit View to Instances" checked={fit} onChange={() => { toggle("fit"); }} />
      <MenuSeparator />
      <MenuCheckItem label="Color Predicted Instances" checked={colorPredicted} onChange={() => { toggle("colorPredicted"); }} />
      <MenuSeparator />
      <MenuCheckItem label="Show Instances" checked={showInstances} onChange={() => { toggle("showInstances"); }} />
      <MenuCheckItem label="Show Non-Visible Nodes" checked={showNonVisibleNodes} onChange={() => { toggle("showNonVisibleNodes"); }} />
      <MenuCheckItem label="Show Node Names" checked={showLabels} onChange={() => { toggle("showLabels"); }} />
      <MenuCheckItem label="Show Edges" checked={showEdges} onChange={() => { toggle("showEdges"); }} />
      <MenuSeparator />
      <div className="px-3 py-1 text-[10px] text-[var(--color-sleap-text-muted)] uppercase tracking-wide">
        Edge Style
      </div>
      <MenuCheckItem
        label="Line"
        checked={edgeStyle === "Line"}
        onChange={() => { setVal("edgeStyle", "Line"); }}
      />
      <MenuCheckItem
        label="Wedge"
        checked={edgeStyle === "Wedge"}
        onChange={() => { setVal("edgeStyle", "Wedge"); }}
      />
      <MenuSeparator />
      <div className="px-3 py-1 text-[10px] text-[var(--color-sleap-text-muted)] uppercase tracking-wide">
        Node Size
      </div>
      <div className="flex items-center px-3 py-1 gap-2">
        <input
          type="range"
          min={1}
          max={12}
          value={useAppStore.getState().markerSize}
          onChange={(e) => setVal("markerSize", Number(e.target.value))}
          className="flex-1 h-1 accent-[var(--color-sleap-primary)]"
        />
        <span className="text-[10px] text-[var(--color-sleap-text-muted)] w-4 text-right">
          {useAppStore.getState().markerSize}
        </span>
      </div>
      <MenuSeparator />
      <div className="px-3 py-1 text-[10px] text-[var(--color-sleap-text-muted)] uppercase tracking-wide">
        Color Palette
      </div>
      {Object.keys(PALETTES).map((name) => (
        <MenuCheckItem
          key={name}
          label={name}
          checked={useAppStore.getState().palette === name}
          onChange={() => { setVal("palette", name); }}
        />
      ))}
    </>
  );
}

function LabelsMenu({ onClose }: { onClose: () => void }) {
  const labels = useAppStore((s) => s.labels);
  const totalLabeled = labels?.labeledFrames.length ?? 0;
  const totalInstances = labels?.labeledFrames.reduce(
    (sum, lf) => sum + lf.instances.length, 0
  ) ?? 0;

  const exec = (cmd: Parameters<typeof commandContext.execute>[0]) => {
    onClose();
    commandContext.execute(cmd);
  };

  return (
    <>
      <MenuItem label="Add Instance" shortcut={`${modKey}+I`} onClick={() => exec(AddInstance)} />
      <MenuItem label="Delete Instance" shortcut={`${modKey}+Backspace`} onClick={() => exec(DeleteSelectedInstance)} />
      <MenuSeparator />
      <MenuItem label="Delete Predictions on Current Frame" onClick={() => exec(DeleteFramePredictions)} />
      <MenuItem label="Delete All Predictions..." onClick={() => {
        if (confirm("Delete all predicted instances across all frames?")) {
          exec(DeleteAllPredictions);
        } else {
          onClose();
        }
      }} />
      <MenuSeparator />
      <div className="px-3 py-1 text-[10px] text-[var(--color-sleap-text-muted)]">
        {totalLabeled} labeled frames, {totalInstances} instances
      </div>
    </>
  );
}

function TracksMenu({ onClose }: { onClose: () => void }) {
  const exec = (cmd: Parameters<typeof commandContext.execute>[0]) => {
    onClose();
    commandContext.execute(cmd);
  };

  return (
    <>
      <MenuItem label="Transpose Instance Tracks" shortcut={`${modKey}+T`} onClick={() => exec(TransposeInstances)} />
      <MenuSeparator />
      <MenuItem label="New Track" shortcut={`${modKey}+0`} onClick={() => exec(AddTrack)} />
      <MenuSeparator />
      <MenuItem label="Copy Instance Track" shortcut={`${modKey}+Shift+C`} onClick={() => exec(CopyTrack)} />
      <MenuItem label="Paste Instance Track" shortcut={`${modKey}+Shift+V`} onClick={() => exec(PasteTrack)} />
    </>
  );
}
