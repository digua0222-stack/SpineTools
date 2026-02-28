# SLEAP Label Web — Architecture Design

## Overview

Port of the SLEAP Qt labeling GUI to a web-based frontend using React + TypeScript. Initial target: desktop app via Tauri v2. Future: standalone browser app with File System Access API.

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Frontend framework** | React 19 + TypeScript | Ecosystem, component model, hooks |
| **Build tool** | Vite 6 | Fast HMR, native ESM, TypeScript support |
| **Desktop shell** | Tauri v2 | Small bundle (~5MB vs ~150MB Electron), native feel, Rust backend for file I/O, Python sidecar support |
| **State management** | Zustand | Mirrors SLEAP's GuiState pub/sub pattern, minimal boilerplate, excellent devtools |
| **Canvas rendering** | Canvas 2D API | Sufficient for skeleton overlays (<100 instances), simple compositing with video frames, good text rendering |
| **Data layer** | @talmolab/sleap-io.js | SLP file loading, HDF5 via Web Worker, video backends |
| **Panel layout** | react-resizable-panels | Matches Qt dock widget behavior, actively maintained |
| **UI components** | Radix UI primitives + Tailwind CSS | Accessible, unstyled primitives we can customize to match desktop feel |
| **Keyboard shortcuts** | tinykeys | Tiny (~400B), supports key sequences, customizable |
| **Testing** | Vitest + Playwright | Unit + E2E, Playwright for visual testing |
| **CSS** | Tailwind CSS v4 | Utility-first, fast prototyping, consistent spacing/colors |

## Project Structure

```
sleap-label-web/
├── docs/                        # Research docs, architecture, specs
├── src/
│   ├── main.tsx                 # App entry point
│   ├── App.tsx                  # Root component (layout shell)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx     # Main layout: menubar + panels + statusbar
│   │   │   ├── MenuBar.tsx      # Application menu bar
│   │   │   ├── StatusBar.tsx    # Bottom status bar
│   │   │   └── PanelLayout.tsx  # Resizable panel container
│   │   ├── video/
│   │   │   ├── VideoPlayer.tsx  # Main video + canvas overlay container
│   │   │   ├── VideoCanvas.tsx  # Canvas element for frame rendering
│   │   │   ├── OverlayCanvas.tsx# Canvas element for skeleton overlay
│   │   │   ├── Seekbar.tsx      # Frame navigation seekbar
│   │   │   └── PlaybackControls.tsx
│   │   ├── panels/
│   │   │   ├── VideosPanel.tsx  # Video list panel
│   │   │   ├── SkeletonPanel.tsx# Skeleton editor panel
│   │   │   ├── InstancesPanel.tsx# Instance list panel
│   │   │   └── SuggestionsPanel.tsx
│   │   ├── dialogs/
│   │   │   ├── ImportVideosDialog.tsx
│   │   │   ├── DeleteDialog.tsx
│   │   │   ├── MergeDialog.tsx
│   │   │   ├── ShortcutsDialog.tsx
│   │   │   ├── GoToFrameDialog.tsx
│   │   │   └── ExportDialog.tsx
│   │   └── common/
│   │       ├── DataTable.tsx    # Generic sortable table
│   │       ├── ContextMenu.tsx
│   │       └── ColorSwatch.tsx
│   ├── stores/
│   │   ├── appStore.ts          # Main application state (mirrors GuiState)
│   │   ├── labelsStore.ts       # Labels data (wraps sleap-io.js Labels)
│   │   ├── selectionStore.ts    # Current video, frame, instance, node
│   │   ├── viewStore.ts         # View settings (zoom, pan, show/hide flags)
│   │   └── preferencesStore.ts  # Persistent user preferences
│   ├── commands/
│   │   ├── types.ts             # Command interfaces, UpdateTopic enum
│   │   ├── CommandContext.ts     # Central command executor
│   │   ├── fileCommands.ts      # New, Open, Save, Import, Export
│   │   ├── navCommands.ts       # Frame navigation commands
│   │   ├── editCommands.ts      # Instance/skeleton editing commands
│   │   ├── trackCommands.ts     # Track management commands
│   │   └── viewCommands.ts      # View toggle commands
│   ├── canvas/
│   │   ├── FrameRenderer.ts     # Renders video frame to canvas
│   │   ├── SkeletonRenderer.ts  # Renders skeleton instances
│   │   ├── NodeRenderer.ts      # Renders individual nodes with interaction
│   │   ├── EdgeRenderer.ts      # Renders edges (line + wedge styles)
│   │   ├── TrailRenderer.ts     # Renders track trails
│   │   ├── SeekbarRenderer.ts   # Renders seekbar marks and tracks
│   │   ├── HitTester.ts         # Point-in-shape hit testing for selection
│   │   └── colors.ts            # Color palette management
│   ├── hooks/
│   │   ├── useVideoPlayer.ts    # Video loading and frame access
│   │   ├── useCanvasInteraction.ts # Mouse/touch handlers for canvas
│   │   ├── useKeyboardShortcuts.ts # Shortcut registration and dispatch
│   │   ├── useUndoRedo.ts       # Undo/redo stack
│   │   └── useFileIO.ts         # File open/save via Tauri or File System Access API
│   ├── lib/
│   │   ├── shortcuts.ts         # Shortcut definitions (from shortcuts.yaml)
│   │   ├── colorPalettes.ts     # Color palette definitions
│   │   └── platform.ts          # Platform detection (Tauri vs browser)
│   └── types/
│       └── index.ts             # Shared TypeScript types
├── src-tauri/                   # Tauri Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       └── commands.rs          # Rust commands for file I/O
├── public/
│   └── index.html
├── tests/
│   ├── unit/                    # Vitest unit tests
│   ├── e2e/                     # Playwright E2E tests
│   └── fixtures/                # Test SLP files
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── playwright.config.ts
```

## Architecture Patterns

### 1. State Management (Zustand — mirrors GuiState)

The Qt app uses `GuiState`, a key-value store with change callbacks. Zustand provides the same pattern natively:

```typescript
// stores/appStore.ts
interface AppState {
  // Selection state
  video: Video | null;
  frameIdx: number;
  instance: Instance | null;
  labeledFrame: LabeledFrame | null;
  skeleton: Skeleton | null;

  // View state
  showInstances: boolean;
  showLabels: boolean;
  showEdges: boolean;
  edgeStyle: 'Line' | 'Wedge';
  fit: boolean;
  fitSelection: boolean;
  colorPredicted: boolean;
  palette: string;
  distinctlyColor: 'instances' | 'nodes' | 'edges';
  markerSize: number;
  nodeLabelSize: number;
  trailLength: number;
  trailShade: string;

  // Project state
  labels: Labels | null;
  filename: string | null;
  hasChanges: boolean;
  projectLoaded: boolean;

  // Clipboard
  clipboardTrack: Track | null;
  clipboardInstance: Instance | null;

  // Frame range
  frameRange: [number, number] | null;
  hasFrameRange: boolean;

  // Actions
  setVideo: (video: Video) => void;
  setFrameIdx: (idx: number) => void;
  incrementFrameIdx: (step: number) => void;
  toggleShowInstances: () => void;
  // ... etc
}
```

### 2. Command Pattern (mirrors CommandContext)

Every user action goes through the command system, enabling undo/redo and change tracking:

```typescript
// commands/types.ts
interface Command {
  name: string;
  topics: UpdateTopic[];        // What this command affects
  execute(ctx: CommandContext, params?: any): void;
  undo?(ctx: CommandContext): void;  // For future undo support
}

enum UpdateTopic {
  Labels,
  Frame,
  Skeleton,
  Tracks,
  Suggestions,
  // ...
}
```

### 3. Canvas Rendering Pipeline

Two layered canvases stacked via CSS:

```
┌─────────────────────────────────┐
│  Overlay Canvas (skeleton)      │  ← Canvas 2D, transparent bg
│  ┌─────────────────────────────┐│     Handles: instances, nodes, edges,
│  │                             ││     labels, trails, bounding boxes
│  │  Frame Canvas (video)       ││  ← Canvas 2D or ImageBitmap
│  │                             ││     Handles: video frame rendering
│  └─────────────────────────────┘│
└─────────────────────────────────┘
```

The overlay canvas handles all mouse interaction. Hit testing uses simple distance-to-point checks for nodes and distance-to-line for edges.

### 4. File I/O Strategy

**Desktop (Tauri):**
- File dialog via `@tauri-apps/plugin-dialog`
- Read file via `@tauri-apps/plugin-fs` → ArrayBuffer → sleap-io.js `loadSlp()`
- Save: serialize Labels → write via Tauri fs plugin

**Browser (future):**
- File dialog via File System Access API (`showOpenFilePicker()`)
- Read via `FileHandle.getFile()` → `file.arrayBuffer()` → `loadSlp()`
- Remote files: HTTP Range requests via sleap-io.js streaming

**Abstraction layer:**
```typescript
// hooks/useFileIO.ts
function useFileIO() {
  const isTauri = '__TAURI__' in window;

  return {
    openFile: isTauri ? openViaTauri : openViaBrowser,
    saveFile: isTauri ? saveViaTauri : saveViaBrowser,
  };
}
```

### 5. Video Frame Pipeline

```
sleap-io.js Video Backend
    │
    ├── Embedded: video.backend.getFrame(idx) → ImageData
    ├── External MP4: HTML5 Video element (seek + drawImage)
    └── External URL: Range requests via Worker
    │
    ▼
ImageBitmap (or ImageData)
    │
    ▼
Canvas 2D: ctx.drawImage(bitmap, 0, 0)
    │
    ▼
Overlay Canvas: draw nodes, edges, labels
```

### 6. Keyboard Shortcut System

```typescript
// lib/shortcuts.ts
const DEFAULT_SHORTCUTS: Record<string, string> = {
  'new': 'Ctrl+N',
  'open': 'Ctrl+O',
  'save': 'Ctrl+S',
  'save as': 'Ctrl+Shift+S',
  'add instance': 'Ctrl+I',
  'delete instance': 'Backspace',
  'frame next': 'ArrowRight',
  'frame prev': 'ArrowLeft',
  'frame next medium step': 'Ctrl+ArrowRight',
  'frame prev medium step': 'Ctrl+ArrowLeft',
  'goto next labeled': 'Alt+ArrowRight',
  'goto prev labeled': 'Alt+ArrowLeft',
  'goto next suggestion': 'Ctrl+.',
  'goto prev suggestion': 'Ctrl+,',
  'select next': 'Tab',
  'clear selection': 'Escape',
  'transpose': 'T',
  // ... full list from shortcuts.yaml
};
```

## Component Interaction Flow

```
User clicks node on canvas
        │
        ▼
OverlayCanvas.onMouseDown
        │
        ▼
HitTester.findNodeAt(x, y) → node
        │
        ▼
selectionStore.setSelectedNode(node)
        │
        ▼
User drags mouse
        │
        ▼
OverlayCanvas.onMouseMove
        │
        ▼
CommandContext.execute(SetPointLocation, { node, x, y })
        │
        ├──→ labelsStore.updatePoint()  (mutate data)
        ├──→ appStore.setHasChanges(true)
        └──→ OverlayCanvas re-renders (subscribed to labelsStore)
```

## Menu Structure (Complete)

### File
- New Project (Ctrl+N)
- Open Project... (Ctrl+O)
- Import... → COCO, DeepLabCut, Multi-DLC, NWB, Analysis HDF5
- Merge into Project...
- ---
- Add Videos...
- Replace Videos...
- ---
- Save (Ctrl+S)
- Save As... (Ctrl+Shift+S)
- Export Analysis HDF5... → Current Video / All Videos
- Export Analysis CSV... → Current Video / All Videos
- Export NWB...
- ---
- Reset preferences to defaults...
- Open Preferences Directory...
- ---
- Quit

### Go
- Next Labeled Frame
- Previous Labeled Frame
- Last Interacted Frame
- Next User Labeled Frame
- Next Suggestion
- Previous Suggestion
- Next Track Spawn Frame
- ---
- Next Video
- Previous Video
- ---
- Go to Frame...
- Select to Frame...
- ---
- Select Next Instance
- Clear Selection

### View
- Fit View to Instances
- Fit View to Selection
- ---
- Color Predicted Instances
- Color Palette → [palette options]
- Apply Distinct Colors To → instances / nodes / edges
- ---
- Show Instances
- Show Non-Visible Nodes
- Show Node Names
- Show Edges
- Edge Style → Line / Wedge
- Node Marker Size → [size options]
- Node Label Size → [size options]
- ---
- Trail Length → [length options]
- Trail Shade → [shade options]
- ---
- Render Video Clip with Instances...
- ---
- [Dock panel toggles: Videos, Skeleton, Instances, Suggestions]

### Labels
- Add Instance (Ctrl+I)
- Instance Placement Method → Best / Average / Force Directed / Random / Copy prior / Copy predictions
- Delete Instance
- Custom Instance Delete...
- ---
- Extract Clip and Labels...
- Extract Clip Labels Package...
- ---
- Add Instances from All Predictions on Current Frame
- ---
- Copy Instance (Ctrl+C)
- Paste Instance (Ctrl+V)
- ---
- Delete Predictions on Current Frame
- Delete Predictions from Clip...
- Delete Predictions in Area...
- Delete Predictions with Low Score...
- Delete Predictions with Fewer Points...
- Delete Predictions beyond Max per Frame...
- Delete All Predictions
- Delete All User Instances

### Predict
- Run Training...
- Run Inference...
- ---
- Active Learning Suggestions
- Expert PMI...

### Track
- Track Methods... → Simple / Flow / FlowShift
- ---
- Transpose Instances (T)
- Delete Track
- ---
- Set Instance Track → [track options]
- Copy Track to clipboard
- Paste Track from clipboard

### Help
- Keyboard Shortcuts
- About

## Rendering Details

### Node Rendering
- Circle with configurable radius (marker size)
- Filled with instance color (alpha 128) for visible points
- Hollow with thin border for non-visible points
- Smaller radius for non-visible
- Cosmetic pen (constant screen-space width regardless of zoom)
- On hover: cursor change, tooltip with node name (+ score for predicted)
- On click: select parent instance
- On drag: update point position, update connected edges
- Alt+click: drag entire instance
- Shift+click: mark all points as complete
- Ctrl+click: duplicate instance
- Right-click: toggle visibility

### Edge Rendering
- Line style: straight line between nodes
- Wedge style: tapered polygon (thicker at src, thinner at dst)
- Color from color manager
- Hidden when either endpoint is non-visible (unless show_non_visible)

### Instance Selection
- Dashed bounding box around selected instance
- Yellow highlight box for predictions "not in training data"
- Track label shows track name and prediction score on hover

### Seekbar Marks
- Simple marks: black vertical lines for labeled frames
- Filled/open marks: blue for user labels
- Predicted marks: light blue
- Track bars: colored horizontal bars showing track occupancy
- Tick marks: gray frame indicators
- Selection range: highlighted region for frame range selection

## Phase 1 Feature Priority (MVP)

1. ✅ Load SLP file (via file picker)
2. ✅ Display video frames
3. ✅ Render skeleton instances (nodes + edges + labels)
4. ✅ Frame navigation (arrow keys, seekbar)
5. ✅ Instance selection (click)
6. ✅ Node dragging (move keypoints)
7. ✅ Seekbar with labeled frame marks
8. ✅ Videos panel
9. ✅ Instances panel
10. ✅ Save project
11. ✅ Add/delete instances
12. ✅ Keyboard shortcuts (core navigation + editing)
13. ✅ Zoom and pan

## Phase 2 Features

- Skeleton editor panel
- Suggestions panel
- Track management
- Import/export (COCO, DLC, NWB, CSV, HDF5)
- Color palettes and customization
- Trail overlay
- Multiple video support
- Merge projects
- Custom delete dialogs
- Shortcut customization

## Phase 3 Features (Future)

- Training/inference integration (Python sidecar)
- Active learning suggestions
- Confidence map / PAF overlays
- Video clip export with rendered instances
- Static web hosting mode
- Collaborative labeling

---

## Recent Architectural Additions

### Multi-Frame Undo in CommandContext

The command system now supports two types of undo snapshots:

**Single-frame snapshots** (default): For commands that only affect the current
frame (AddInstance, DeleteInstance, etc.), the system takes a snapshot of the
current frame's instances before executing the command.

**Multi-frame snapshots**: For bulk operations that modify multiple frames
(DeleteAllPredictions), the system snapshots ALL labeled frames. Commands opt
into this by setting `skipAutoSnapshot: true` and calling
`commandContext.takeAllFramesSnapshot()` and `commandContext.pushUndoSnapshot()`
directly before executing.

```typescript
// CommandContext.ts

interface SingleFrameData {
  videoRef: Video;
  frameIdx: number;
  instances: Instance[];
}

interface UndoSnapshot {
  commandName: string;
  frame: SingleFrameData | null;        // Single frame (most commands)
  allFrames: SingleFrameData[] | null;  // Multi-frame (bulk operations)
  tracks: Track[];                       // Track state at snapshot time
  selectedIdx: number;
  activeVideo: Video | null;
  activeFrameIdx: number;
}
```

The `restoreSnapshot()` method detects which type of snapshot it is and
restores accordingly: single-frame replaces instances on one `LabeledFrame`;
multi-frame rebuilds the entire `labeledFrames` array.

### Toast Notification Pattern

User feedback is provided via the `sonner` toast library. The pattern:

```typescript
import { toast } from "sonner";

// Success notification
toast.success("Loaded project.slp", {
  description: "3 videos, 150 labeled frames",
});

// Error notification
toast.error("Failed to load project", {
  description: err.message,
});
```

The `<Toaster />` component is rendered at the app root. Toasts auto-dismiss
after a timeout. This replaces the previous pattern of `console.log` /
`console.error` for user-facing feedback.

### Consolidated File Loading

All file loading paths now go through `src/lib/loadProject.ts`:

```
loadProjectFromFile(file: File) -> Promise<boolean>
loadProjectFromPath(path: string, readFile: ...) -> Promise<boolean>
```

These functions handle the complete loading lifecycle:
1. Check for unsaved changes (confirm dialog if `hasChanges`)
2. Set loading state (`setLoading(true, message)`)
3. Parse the SLP file via `loadSlp()`
4. Set labels + filename in store
5. Show success/error toast
6. Clear loading state

Previously, file loading was duplicated across `AppShell.handleDrop`,
`WelcomeScreen`, `OpenProjectCommand`, and `useFileIO` hook -- each with
different error handling and UX patterns. The consolidated helper ensures
consistent behavior everywhere.

### Training/Inference Placeholder Architecture

Training and inference cannot run in the browser (they require GPU, Python,
and sleap-nn). The web app provides **placeholder dialogs** that:

1. Show the full configuration UI (model type, backbone, epochs, etc.)
2. Display a "Coming Soon" badge
3. Link to alternatives (SLEAP desktop, CLI, Colab)
4. Have a disabled "Start" button

The dialogs are store-driven:

```typescript
// In appStore.ts
trainingDialogOpen: boolean;
inferenceDialogOpen: boolean;
setTrainingDialogOpen: (open: boolean) => void;
setInferenceDialogOpen: (open: boolean) => void;
```

Menu items in `PredictMenu` call `setTrainingDialogOpen(true)` etc.
The dialog components (`TrainingDialog.tsx`, `InferenceDialog.tsx`) read
the open state from the store and render conditionally.

This pattern establishes the UI structure so that when sleap-nn integration
is implemented (via Tauri sidecar or WebSocket), the dialogs only need their
submit handlers wired up.

### Dialog Management Pattern (Store-Driven)

Dialogs are managed via boolean state in the Zustand store:

```typescript
// Store state
goToFrameDialogOpen: boolean;
trainingDialogOpen: boolean;
inferenceDialogOpen: boolean;

// Store actions
setGoToFrameDialogOpen: (open: boolean) => void;
setTrainingDialogOpen: (open: boolean) => void;
setInferenceDialogOpen: (open: boolean) => void;
```

Dialog components subscribe to their open state and render using the
Radix-based `<Dialog>` component from shadcn/ui:

```typescript
export function GoToFrameDialog() {
  const open = useAppStore((s) => s.goToFrameDialogOpen);
  const setOpen = useAppStore((s) => s.setGoToFrameDialogOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>...</DialogContent>
    </Dialog>
  );
}
```

This pattern allows any part of the app (menu items, keyboard shortcuts,
context menus) to open dialogs by calling a single store action, without
needing to thread props through the component tree.

### Loading State Pattern

The app store includes loading state for blocking operations:

```typescript
isLoading: boolean;
loadingMessage: string;
setLoading: (loading: boolean, message?: string) => void;
```

When `isLoading` is true, a loading overlay or spinner is shown. The
`loadProjectFromFile()` helper sets this automatically around file parsing.

### shadcn/ui Component Library

The project uses shadcn/ui for dialog, form, and control primitives. These
are Radix-based, accessible, and styled with Tailwind CSS. Components are
installed into `src/components/ui/` and include:

- `Dialog` / `DialogContent` / `DialogHeader` / `DialogFooter`
- `Select` / `SelectContent` / `SelectItem`
- `Input`, `Button`, `Badge`, `Label`, `Separator`
- `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`
- `Table`, `Card`, `ScrollArea`, `Tooltip`

This establishes a consistent design system for all future dialogs and forms.

### Skeleton Command System (Separate Undo Interceptor)

Skeleton editing operations (add/delete/rename nodes, add/delete edges, load
template) require a specialized undo mechanism because the standard
`CommandContext` undo system only snapshots instance data per frame, not
skeleton structure.

**Architecture:**

```
src/commands/skeletonCommands.ts
├── SkeletonSnapshot interface    — captures nodes, edges, all instance points
├── takeSkeletonSnapshot()        — deep-clone current skeleton + instance state
├── restoreSkeletonSnapshot()     — restore from snapshot, rebuild cache
├── storeSkeletonUndo()           — associate snapshot with undo entry
├── skeletonUndoMap (WeakMap)     — maps undo snapshots → skeleton state
└── installSkeletonUndoInterceptor() — wraps ctx.undo/redo for skeleton restore
```

**How it works:**

1. Each skeleton command sets `skipAutoSnapshot: true` to bypass the standard
   frame-level snapshot.
2. Before mutation, it calls `takeSkeletonSnapshot()` to capture the full
   skeleton state (nodes, edges) plus all instance point arrays.
3. The snapshot is stored in a module-level `WeakMap<object, SkeletonSnapshot>`
   keyed by the undo stack entry.
4. `installSkeletonUndoInterceptor()` monkey-patches `ctx.undo()` and
   `ctx.redo()`. Before delegating to the original method, it peeks at the
   top of the undo/redo stack. If the entry has an associated skeleton
   snapshot, it restores skeleton state after the standard restore runs.
5. On undo, the current skeleton state is saved for redo; on redo, the
   reverse applies.

**Commands using this system:**
- `AddNodeCommand` — adds node + NaN point to all instances
- `DeleteNodeCommand` — removes node, edges, and corresponding instance points
- `RenameNodeCommand` — renames node and all instance point names
- `AddEdgeCommand`, `DeleteEdgeCommand` — modify edge list
- `LoadSkeletonTemplateCommand` — replaces entire skeleton from template

### Trail Rendering Architecture

Trail rendering is implemented as a separate rendering pass in
`src/canvas/TrailRenderer.ts`, called from `VideoPlayer.tsx` after the
standard skeleton rendering.

**Pipeline:**

```
VideoPlayer overlay render
│
├── renderInstances()        ← Standard skeleton renderer
│
└── renderTrails()           ← Trail renderer (if trailLength > 0)
    │
    ├── Get all labeled frames for current video
    ├── For each tracked instance on current frame:
    │   ├── Look back `trailLength` frames
    │   ├── Find same-track instances, compute centroids
    │   └── Collect trail points with age (distance from current)
    │
    └── Draw:
        ├── Polyline segments with fading opacity (age-based alpha)
        └── Small dots at each centroid position
```

**Key design decisions:**
- Trail rendering operates in image-space coordinates (same transform as
  skeleton rendering), so trails scale correctly with zoom/pan.
- Line width scales inversely with zoom (`2 / zoom`) for consistent appearance.
- Opacity fades linearly: `1 - age / (trailLength + 1)`, so the current frame
  is fully opaque and the oldest frame is nearly transparent.
- Uses `frameMap` (Map<number, LabeledFrame>) for O(1) frame lookback.
- Only draws for instances that have a track assignment.

### Export Utilities

`src/lib/exportUtils.ts` provides reusable export functions:

**`generateCSV(labels)`** — Converts labels to CSV with columns:
`video_filename, frame_idx, track_name, instance_type, node_name, x, y, score, visible`.
Handles CSV escaping (quotes, commas, newlines). NaN coordinates become empty strings.

**`downloadFile(content, filename, mimeType)`** — Creates a Blob URL, triggers
download via a hidden `<a>` element, and revokes the URL. Works in all browsers.

**`generatePackageJSON(labels)`** — Creates a self-contained JSON package with:
- Format identifier and version
- Export timestamp
- Video manifest (filenames, shapes, fps, embedded status)
- Full labels data from `labels.toDict()`

**`suggestSaveFilename(currentFilename, extension)`** — Auto-increments version
numbers in filenames. Matches `.v002` pattern, increments to `.v003`, etc.
If no version exists, appends `.v002`.

### Persistent Preferences (Zustand Persist Middleware)

View preferences are persisted to `localStorage` using Zustand's `persist`
middleware:

```typescript
// In appStore.ts
export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({ /* ... state and actions ... */ }),
    {
      name: "sleap-label-web-prefs",
      partialize: (state) => ({
        palette: state.palette,
        edgeStyle: state.edgeStyle,
        markerSize: state.markerSize,
        nodeLabelSize: state.nodeLabelSize,
        trailLength: state.trailLength,
        colorPredicted: state.colorPredicted,
        showInstances: state.showInstances,
        showLabels: state.showLabels,
        showEdges: state.showEdges,
        showNonVisibleNodes: state.showNonVisibleNodes,
      }),
    }
  )
);
```

**Key design decisions:**
- `partialize` ensures only view preferences are persisted, not project data
  or transient state (selection, loading, dialogs).
- The persist key `"sleap-label-web-prefs"` is stable across versions.
- Preferences are restored automatically on app load.

### Error Boundary Pattern

`src/components/layout/ErrorBoundary.tsx` is a React class component that
catches render errors in the component tree:

```
App
└── ErrorBoundary
    └── AppShell
        ├── MenuBar
        ├── VideoPlayer
        ├── PanelLayout
        └── StatusBar
```

**Behavior:**
- In production: shows "Something went wrong" message with a "Reload" button.
- In development (`import.meta.env.DEV`): also shows the error message and
  component stack trace for debugging.
- Uses `getDerivedStateFromError` for synchronous error capture and
  `componentDidCatch` for logging.

### Skeleton Templates Data Structure

`src/lib/skeletonTemplates.ts` defines predefined body plans:

```typescript
interface SkeletonTemplate {
  name: string;           // Display name (e.g., "Fly (32 nodes)")
  description: string;    // Short description
  nodes: string[];        // Ordered list of node names
  edges: [number, number][]; // Pairs of node indices for edges
}
```

**Available templates:**
| ID | Name | Nodes | Edges |
|----|------|-------|-------|
| `fly` | Fly (32 nodes) | 32 | 28 |
| `mouse_topdown` | Mouse top-down (12 nodes) | 12 | 11 |
| `human` | Human (17 nodes) | 17 | 16 |
| `celegans` | C. elegans (2 nodes) | 2 | 1 |
| `custom` | Custom (empty) | 0 | 0 |

Templates are loaded via `LoadSkeletonTemplateCommand`, which:
1. Creates new `Node` objects from template names
2. Creates `Edge` objects from template index pairs
3. Replaces skeleton nodes and edges
4. Resets all instance point arrays to NaN positions matching new node count
5. Takes a skeleton snapshot for undo support
