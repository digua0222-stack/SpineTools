# User Flows

All currently supported user workflows in SLEAP Label Web. For each flow,
documents what works, known limitations, and keyboard shortcuts.

Last updated: 2026-02-28

---

## 1. Opening a Project

### Methods

| Method | How | Status |
|--------|-----|--------|
| File picker | Menu > File > Open Project (Ctrl+O) | Works |
| Drag-and-drop | Drop .slp file on window | Works |
| Welcome screen | Click "Open Project" button or drop file | Works |

### Flow

1. User triggers open via any method above
2. If unsaved changes exist, a confirmation dialog appears ("You have unsaved changes...")
3. Loading indicator appears with filename
4. SLP file is parsed via `loadSlp()` (h5wasm in Web Worker)
5. On success: toast notification with video/frame counts, project renders
6. On error: error toast with message, previous state preserved

### Known Limitations

- **Only .slp files supported** -- cannot open .json exports, COCO, DLC, or NWB
- **Drag-and-drop silently ignores non-.slp files** (no error message)
- **No "Recent Projects" list** for quick re-open
- **Opening replaces current project** -- no multi-window support
- **Missing video files** produce no user-facing warning (only console error)

### Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+O | Open Project |
| Ctrl+N | New Project (resets state) |

---

## 2. Navigating Frames

### Methods

| Method | How | Status |
|--------|-----|--------|
| Arrow keys | Right/Left for single frame step | Works |
| Medium step | Ctrl+Right/Left (10 frames) | Works |
| Large step | Ctrl+Alt+Right/Left (100 frames) | Works |
| Seekbar click | Click on seekbar to jump | Works |
| Seekbar drag | Click and drag for scrubbing | Works |
| Go to Frame | Ctrl+J opens dialog, type frame number | Works |
| Labeled frame nav | Alt+Right/Left jumps to next/prev labeled | Works |
| Suggestion nav | Space/Shift+Space cycles suggestions | Works |
| Last interacted | Ctrl+A jumps to last edited frame | Works |
| User labeled nav | Ctrl+U jumps to next user-labeled frame | Works |
| Home/End | Jump to first/last frame | Works |
| Playback | Play button or play/pause controls | Works |

### Go to Frame Dialog

1. Press Ctrl+J (or Go > Go to Frame...)
2. Dialog opens with current frame number pre-filled
3. Type a frame number, press Enter or click "Go"
4. Dialog closes, video navigates to that frame
5. Valid range shown below input (0 to maxFrame)

### Playback

1. Click play button in seekbar controls
2. Frames advance at selected speed (0.25x to 8x)
3. Click pause or press play button again to stop
4. Speed selector shows current speed, click to change

### Known Limitations

- **Go to Frame dialog**: replaces old `window.prompt()` -- now uses proper dialog
- **Playback wraps around** at end of video (no stop-at-end option)
- **Hardcoded 30 fps** for playback timing
- **No Next Track Spawn Frame** command (Ctrl+E defined but not bound)
- **No frame range selection** on seekbar (Shift+drag not implemented)
- **`setFrameIdx` clears instance selection** -- selection lost on every frame change

### Shortcuts

| Key | Action |
|-----|--------|
| Right | Next frame |
| Left | Previous frame |
| Ctrl+Right | Next 10 frames |
| Ctrl+Left | Previous 10 frames |
| Ctrl+Alt+Right | Next 100 frames |
| Ctrl+Alt+Left | Previous 100 frames |
| Home | First frame |
| End | Last frame |
| Alt+Right | Next labeled frame |
| Alt+Left | Previous labeled frame |
| Space | Next suggestion |
| Shift+Space | Previous suggestion |
| Ctrl+A | Last interacted frame |
| Ctrl+U | Next user-labeled frame |
| Ctrl+J | Go to Frame dialog |

---

## 3. Labeling (Instance Editing)

### Adding an Instance

1. Right-click on canvas > "Add Instance"
2. OR: Ctrl+I
3. OR: Labels > Add Instance from menu
4. A new empty instance is created (all nodes at NaN)
5. Node placement mode activates (badge shows "Placing: node_name")
6. Click on canvas to place each node in order
7. After last node, placement mode ends

### Selecting an Instance

1. Click on a node to select its parent instance
2. OR: Click on an instance centroid
3. OR: Click a row in the Instances panel
4. Selected instance shows dashed bounding box
5. Tab key cycles through instances on current frame

### Node Dragging

1. Click and drag a node on the selected instance
2. Node follows mouse position
3. Release to place
4. Changes are reflected immediately in the overlay

### Node Placement Mode

1. When a new instance has unplaced (NaN) nodes, placement mode activates
2. Badge shows which node is being placed
3. Click on canvas to set node position
4. Nodes are placed in skeleton order
5. Press Escape to exit placement mode early (remaining nodes stay NaN)

### Known Limitations

- **Node dragging bypasses undo/redo** -- cannot undo a drag operation
- **Node placement bypasses undo/redo** -- placed nodes cannot be undone
- **No Alt+drag for whole instance movement**
- **No double-click to convert predicted instance** to user instance
- **No instance rotation** (Alt+scroll)
- **No instance duplication** (Ctrl+click)
- **Instance placement method is always "empty"** -- no Best, Average, Copy Prior options
- **Hit test threshold doesn't scale with zoom** -- hard to click nodes at low zoom

### Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+I | Add Instance |
| Backspace / Ctrl+Backspace | Delete Instance |
| Ctrl+C | Copy Instance |
| Ctrl+V | Paste Instance |
| Tab / ` | Select Next Instance |
| Escape | Clear Selection / Exit placement mode |

---

## 4. Skeleton Editing

### Adding a Node

1. Open Skeleton panel tab
2. Click "New Node" button
3. Dialog appears with auto-generated name (node_0, node_1, ...)
4. Edit name, click "Add"
5. Node appears in the Nodes table

### Removing a Node

1. Select a node row in the Nodes table
2. Click "Delete Node" button
3. Node is removed from skeleton
4. Connected edges are also removed

### Adding an Edge

1. Switch to Edges tab in Skeleton panel
2. Click "New Edge" button
3. Select source and destination nodes from dropdowns
4. Click "Add"
5. Edge appears in the Edges table

### Removing an Edge

1. Select an edge row in the Edges table
2. Click "Delete Edge" button
3. Edge is removed

### Known Limitations

- **Skeleton editing bypasses undo/redo** -- mutations not captured in undo stack
- **No duplicate node name validation** -- can create two nodes with same name
- **No duplicate edge validation** -- can create parallel edges
- **Self-loop edges possible** -- same node for source and destination
- **Deleting a node doesn't update existing instances** -- instance point arrays become corrupt
- **No inline rename** -- must delete and re-add to change a node name
- **Template selector is a stub** -- dropdown logs to console, doesn't load templates
- **No skeleton import/export** from standalone files

---

## 5. Track Management

### Assigning a Track via Context Menu

1. Right-click on an instance
2. Under "Assign Track", see list of existing tracks
3. Click a track name to assign
4. Instance color updates to match track

### Creating a New Track

1. Ctrl+0 creates a new track
2. OR: Right-click > Assign Track > New Track

### Transposing Tracks

1. Select an instance
2. Press Ctrl+T (or Labels > Transpose Instance Tracks)
3. The selected instance swaps tracks with the next instance

### Copy/Paste Track

1. Select instance, press Ctrl+Shift+C to copy track
2. Select another instance, press Ctrl+Shift+V to paste track

### Known Limitations

- **No Ctrl+1-9 shortcuts** for quick track assignment (P0 blocker)
- **No track propagation** -- changes don't propagate to subsequent frames
- **No track deletion** (individual or bulk)
- **No track rename**
- **No "Propagate Track Labels" toggle**
- **No Next Track Spawn Frame navigation** (Ctrl+E)
- **No Ctrl+hold tracks legend overlay**

### Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+0 | New Track |
| Ctrl+T | Transpose Instance Tracks |
| Ctrl+Shift+C | Copy Instance Track |
| Ctrl+Shift+V | Paste Instance Track |

---

## 6. Undo/Redo

### How It Works

1. Mutating commands automatically snapshot frame state before execution
2. Ctrl+Z undoes the last command (restores snapshot)
3. Ctrl+Shift+Z redoes the last undone command
4. Up to 100 undo levels
5. Performing a new action clears the redo stack

### Multi-Frame Undo

- Bulk operations (e.g., Delete All Predictions) use `takeAllFramesSnapshot()`
- This snapshots ALL labeled frames, not just the current one
- Undo restores all frames to their pre-operation state
- Commands with `skipAutoSnapshot: true` manage their own snapshots

### Known Limitations

- **Node dragging is NOT undoable** -- direct mutation, no snapshot taken
- **Node placement is NOT undoable** -- direct mutation
- **Skeleton editing is NOT undoable** -- mutations bypass command system
- **Undo labels in EditMenu may be stale** -- `commandContext` properties aren't reactive

### Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |

---

## 7. View Controls

### Zoom

| Method | How | Status |
|--------|-----|--------|
| Mouse wheel | Scroll up/down to zoom in/out | Works |
| Double-click | Reset to fit view | Works |
| Fit to instances | Ctrl+= (auto-zoom to all instances) | Works |

- Zoom range: 0.1x to 20x
- Zoom centers on mouse cursor position

### Pan

| Method | How | Status |
|--------|-----|--------|
| Middle-click drag | Hold middle button and drag | Works |

### Display Options

| Option | How | Status |
|--------|-----|--------|
| Show/hide instances | H key or View > Show Instances | Works |
| Show non-visible nodes | View menu checkbox | Works |
| Show node names | Ctrl+Tab or View menu | Works |
| Show edges | Ctrl+Shift+Tab or View menu | Works |
| Edge style (Line/Wedge) | View > Edge Style | Works |
| Node marker size | View > Node Marker Size slider | Works |
| Color predicted instances | View menu checkbox | Works |
| Color palette | View > Color Palette picker | Works |

### Known Limitations

- **No pinch-to-zoom** for trackpad/touch
- **Pan requires middle-click** -- many laptops have no middle button
- **No Fit View to Selection** (selected instance only)
- **No trail rendering** despite state existing
- **No Node Label Size menu control** despite state existing
- **No Distinct Colors To option** (instances/nodes/edges)
- **No zoom limits feedback** -- silently clamps

### Shortcuts

| Key | Action |
|-----|--------|
| H | Toggle Show Instances |
| Ctrl+Tab | Toggle Show Node Names |
| Ctrl+Shift+Tab | Toggle Show Edges |
| Ctrl+= | Fit View to Instances |

---

## 8. Export

### Export JSON

1. File > Export JSON (or File > Save with Ctrl+S)
2. Labels data is serialized to JSON via `labels.toDict()`
3. Browser downloads the JSON file

### Export Analysis CSV

- Menu item exists but is **disabled** (not yet implemented)

### Known Limitations

- **Cannot save as .slp** -- only JSON export works
- **Export CSV is disabled**
- **No Export HDF5** or Export NWB
- **No Export Labels Package** for remote training
- **JSON export cannot be re-imported** by SLEAP desktop
- **No file picker for save location** -- uses browser download

---

## 9. Training / Inference (Placeholders)

### Training Dialog

1. Predict > Run Training... (or menu item)
2. Dialog opens with "Coming Soon" badge
3. Configuration options visible but non-functional:
   - Model type (Single Animal, Top-Down, Bottom-Up)
   - Training profile (Default, Fast, Accurate)
   - Backbone selection (UNet, LEAP CNN, Stacked Hourglass)
   - Epochs, batch size
   - Per-model tabs for top-down (Centroid + Centered Instance)
4. Info box explains alternatives: SLEAP desktop, CLI, Colab
5. "Start Training" button is disabled

### Inference Dialog

1. Predict > Run Inference... (or menu item)
2. Dialog opens with "Coming Soon" badge
3. Configuration options visible but non-functional:
   - Model selection (no models available)
   - Video selection (current project videos listed)
   - Frame range (All, Labeled only, Custom range)
   - Tracking method (Simple, Optical Flow, Identity)
   - Max instances per frame
4. Info box explains alternatives
5. "Run Inference" button is disabled

### Purpose

These placeholder dialogs:
- Show users what the training/inference workflow will look like
- Provide links to alternative methods (desktop, CLI, Colab)
- Establish the UI structure for when sleap-nn integration is ready

---

## 10. Side Panels

### Videos Panel

- Lists all videos in the project
- Click a video row to switch to it
- Shows filename (truncated) and frame count
- "Add Videos" and "Remove Video" buttons exist but are **stubs**

### Skeleton Panel

- Nodes tab: lists all skeleton nodes with name
- Edges tab: lists all edges (source -> destination)
- "New Node", "Delete Node", "New Edge", "Delete Edge" buttons work
- Template selector dropdown is a **stub**

### Instances Panel

- Lists instances on current frame
- Shows type (User/Predicted), track, visible/total nodes, score
- Click row to select instance
- Color swatch matches instance color
- "Add Instance" and "Delete Instance" buttons work

### Suggestions Panel

- Lists suggested frames for labeling
- Shows video, frame number, labeled status
- Click row to navigate to that suggestion
- Previous/Next buttons cycle through suggestions
- "Generate Suggestions" and "Clear Suggestions" buttons are **stubs**

---

## Cross-References

- Enhancement proposals: `docs/enhancement-proposals.md`
- Missing features audit: `docs/missing-features-audit.md`
- UX audit: `docs/ux-audit.md`
- Tutorial flow analysis: `docs/tutorial-flow-analysis.md`
- Architecture: `docs/architecture.md`
