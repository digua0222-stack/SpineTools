# User Flows

All currently supported user workflows in SLEAP Label Web. For each flow,
documents what works, known limitations, and keyboard shortcuts.

Last updated: 2026-03-04

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
- **Missing video files** show a placeholder with "Locate Video" button to resolve manually

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
| Track spawn nav | Ctrl+E jumps to next track spawn frame | Works |
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

- **Playback wraps around** at end of video (no stop-at-end option)
- **Hardcoded 30 fps** for playback timing
- **`setFrameIdx` clears instance selection** -- selection lost on every frame change

### Seekbar Features

- **Frame range selection**: Shift+click-drag on seekbar to select a range (used by Delete Predictions from Clip)
- **Instance count header graph**: Bar chart above seekbar showing instance count per frame
- **Labeled frame marks**: Blue marks for user labels, light blue for predictions
- **Track occupancy bars**: Colored horizontal bars showing which frames each track occupies
- **Snap-to-labeled-frame**: Clicking near a labeled frame mark snaps to it (12px threshold)
- **Hover indicator**: Semi-transparent line follows cursor position

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
| Ctrl+E | Next track spawn frame |

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
5. An undo snapshot is taken at drag start via `BeginEdit` command

### Alt+Drag to Move Entire Instance

1. Hold Alt and click-drag on a node of the selected instance
2. All visible nodes move by the same delta
3. Release to finish
4. Movement is undoable (snapshot taken at drag start)

### Instance Rotation (Alt+Scroll)

1. Select a user instance
2. Hold Alt and scroll the mouse wheel
3. All nodes rotate around the instance centroid (5 degrees per tick)
4. Scroll up for counter-clockwise, down for clockwise
5. An undo snapshot is taken at the start of the rotation gesture

### Double-Click to Convert Prediction

1. Double-click on a predicted instance (node or centroid area)
2. The prediction is converted to a user instance via `ConvertPredictionToInstance`
3. The new user instance retains all point positions and track assignment
4. The prediction score is removed (it's now a user instance)
5. The new instance is automatically selected
6. Conversion is undoable

### Node Placement Mode

1. When a new instance has unplaced (NaN) nodes, placement mode activates
2. Badge shows which node is being placed
3. Click on canvas to set node position
4. Nodes are placed in skeleton order
5. Press Escape to exit placement mode early (remaining nodes stay NaN)

### Known Limitations

- **No instance duplication** (Ctrl+click)
- **Instance placement method is always "empty"** -- no Best, Average, Copy Prior options

### Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+I | Add Instance |
| Backspace / Ctrl+Backspace | Delete Instance |
| Ctrl+C | Copy Instance |
| Ctrl+V | Paste Instance |
| Tab / ` | Select Next Instance |
| Escape | Clear Selection / Exit placement mode |
| Alt+Drag | Move entire instance |
| Alt+Scroll | Rotate instance around centroid |
| Double-click prediction | Convert to user instance |

---

## 4. Skeleton Editing

### Adding a Node

1. Open Skeleton panel tab
2. Click "New Node" button
3. Dialog appears with auto-generated name (node_0, node_1, ...)
4. Edit name, click "Add"
5. Node appears in the Nodes table
6. A NaN point is added to every existing instance
7. Operation is undoable

### Inline Node Rename

1. Double-click a node name in the Nodes table
2. An editable text input appears in place of the name
3. Edit the name, press Enter to confirm or Escape to cancel
4. The name is updated in the skeleton and all instance point arrays
5. Duplicate name validation prevents name conflicts
6. Uses `RenameNodeCommand` -- operation is undoable

### Removing a Node

1. Select a node row in the Nodes table
2. Click "Delete Node" button
3. Node is removed from skeleton
4. Connected edges are also removed
5. Corresponding point is removed from all instances
6. Operation is undoable

### Adding/Removing Edges

1. Switch to Edges tab in Skeleton panel
2. "New Edge" / "Delete Edge" buttons work as before
3. Both operations are now undoable via skeleton commands

### Loading a Skeleton Template

1. Select a template from the dropdown in the Skeleton panel
2. Available templates: Fly (32 nodes), Mouse top-down (12 nodes), Human (17 nodes), C. elegans (2 nodes), Custom (empty)
3. The template replaces the current skeleton nodes and edges
4. All instance point arrays are reset to NaN positions matching the new node count
5. Operation is undoable

### Known Limitations

- **No duplicate node name validation** on add (only on rename)
- **No duplicate edge validation**
- **Self-loop edges possible**
- **No skeleton import/export** from standalone files
- **No skeleton visualization** in the panel

### Shortcuts

- No dedicated shortcuts for skeleton editing

---

## 5. Track Management

### Assigning a Track via Ctrl+1-9

1. Select an instance on the current frame
2. Press Ctrl+1 through Ctrl+9 to assign the corresponding track
3. If the track doesn't exist yet, it is created automatically
4. Instance color updates to match the track's palette color
5. If "Propagate Track Labels" is enabled, the change propagates forward

### Ctrl+Hold Tracks Legend

1. Hold the Ctrl key while an instance is selected
2. A semi-transparent overlay appears in the top-right showing all tracks
3. Each track is listed with its number (1-N), color swatch, and name
4. Release Ctrl to hide the overlay
5. Use the numbers shown to know which Ctrl+N shortcut to press

### Assigning a Track via Context Menu

1. Right-click on an instance
2. Under "Assign Track", see list of existing tracks
3. Click a track name to assign
4. Instance color updates to match track

### Creating a New Track

1. Ctrl+0 creates a new track and assigns it to the selected instance
2. OR: Right-click > Assign Track > New Track

### Transposing Tracks

1. Select an instance
2. Press Ctrl+T (or Labels > Transpose Instance Tracks)
3. The selected instance swaps tracks with the next instance

### Copy/Paste Track

1. Select instance, press Ctrl+Shift+C to copy track
2. Select another instance, press Ctrl+Shift+V to paste track

### Track Propagation

1. Select an instance and reassign its track (e.g., via Ctrl+1-9)
2. The `PropagateTrackLabels` command iterates forward through frames
3. All instances with the old track are swapped to the new track
4. Bidirectional swap: instances with the new track get the old track
5. Propagation stops when the old track is no longer found in a frame
6. Multi-frame undo snapshot ensures the entire propagation can be undone

### Propagating Track Labels

1. Fix a track assignment on one frame (e.g., via Ctrl+1-9)
2. Tracks > Propagate Track Labels from menu bar
3. The `PropagateTrackLabels` command iterates forward through frames
4. All instances with the old track are swapped to the new track
5. Bidirectional swap: instances with the new track get the old track
6. Propagation stops when the old track is no longer found in a frame
7. Multi-frame undo snapshot ensures the entire propagation can be undone

### Known Limitations

- **No track deletion** (individual or bulk)
- **No track rename**
- **Propagate Track Labels** requires manual invocation from menu (no auto-propagate toggle)

### Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+0 | New Track |
| Ctrl+1-9 | Assign track 1-9 to selected instance |
| Ctrl+T | Transpose Instance Tracks |
| Ctrl+Shift+C | Copy Instance Track |
| Ctrl+Shift+V | Paste Instance Track |
| Ctrl+E | Next Track Spawn Frame |
| Ctrl (hold) | Show Tracks Legend overlay |

---

## 6. Trail Viewing for Proofreading

### Enabling Trails

1. Go to View > Trail Length in the menu bar
2. Select a trail length: 0 (off), 10, 50, 100, 250, or 500 frames
3. Trail setting persists across sessions via localStorage

### Viewing Trails

1. With trail length > 0, colored polylines appear on the canvas
2. Each line connects centroids of the same track across previous frames
3. Lines fade in opacity from current (solid) to oldest (near-transparent)
4. Small dots mark centroid positions at each frame in the trail
5. Trail color matches the track's palette color

### Detecting Track Swaps

1. Look for trails that cross each other -- this indicates an identity swap
2. Navigate to the crossing point (use Ctrl+E for track spawn frames)
3. Fix the track assignment using Ctrl+1-9
4. Track propagation will fix subsequent frames automatically

---

## 7. Undo/Redo

### How It Works

1. Mutating commands automatically snapshot frame state before execution
2. Ctrl+Z undoes the last command (restores snapshot)
3. Ctrl+Shift+Z redoes the last undone command
4. Up to 100 undo levels
5. Performing a new action clears the redo stack

### What Is Undoable

- Instance add/delete, copy/paste
- Node dragging (via `BeginEdit` snapshot at drag start)
- Node placement (via `BeginEdit` snapshot at placement start)
- Instance rotation (Alt+scroll)
- Alt+drag instance movement
- Prediction conversion (double-click)
- Skeleton editing (add/delete/rename nodes, add/delete edges)
- Skeleton template loading
- Track assignment and propagation
- Delete prediction variants (score threshold, range, max count, labeled frames)
- Delete all predictions

### Multi-Frame Undo

- Bulk operations (e.g., Delete All Predictions, Track Propagation) use `takeAllFramesSnapshot()`
- This snapshots ALL labeled frames, not just the current one
- Undo restores all frames to their pre-operation state
- Commands with `skipAutoSnapshot: true` manage their own snapshots

### Skeleton Undo

- Skeleton commands use a separate undo mechanism via `installSkeletonUndoInterceptor`
- The interceptor wraps `ctx.undo()` / `ctx.redo()` to also restore skeleton state
- A `WeakMap` associates undo snapshots with skeleton node/edge/point state
- Both skeleton structure and instance point arrays are restored on undo

### Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |

---

## 8. View Controls

### Zoom

| Method | How | Status |
|--------|-----|--------|
| Mouse wheel | Scroll up/down to zoom in/out | Works |
| Pinch-to-zoom | Trackpad pinch gesture (uses Ctrl+scroll) | Works |
| Double-click | Reset to fit view (when not on a prediction) | Works |
| Fit to instances | Ctrl+= (auto-zoom to all instances) | Works |

- Zoom range: 0.1x to 20x
- Zoom centers on mouse cursor position
- Pinch-to-zoom uses finer zoom steps for smooth trackpad experience

### Pan

| Method | How | Status |
|--------|-----|--------|
| Middle-click drag | Hold middle button and drag | Works |
| Alt+left-click drag | Hold Alt and left-click drag | Works |

### Display Options

| Option | How | Status |
|--------|-----|--------|
| Show/hide instances | H key or View > Show Instances | Works |
| Show non-visible nodes | View menu checkbox | Works |
| Show node names | Ctrl+Tab or View menu | Works |
| Show edges | Ctrl+Shift+Tab or View menu | Works |
| Edge style (Line/Wedge) | View > Edge Style | Works |
| Node marker size | View > Node Marker Size slider | Works |
| Node label size | View > Node Label Size (Small/Medium/Large/XL) | Works |
| Color predicted instances | View menu checkbox | Works |
| Color palette | View > Color Palette picker | Works |
| Trail length | View > Trail Length (0/10/50/100/250/500) | Works |
| Apply Distinct Colors To | View > Apply Distinct Colors To (Tracks/Instances/Nodes/Edges) | Works |
| Text Size | View > Text Size (Increase/Decrease/Reset) | Works |
| Side Panel toggle | View > Side Panel checkbox | Works |

### Known Limitations

- ~~Pan requires middle-click~~ Alt+left-click pan now also supported
- **No Fit View to Selection** (selected instance only)

### Shortcuts

| Key | Action |
|-----|--------|
| H | Toggle Show Instances |
| Ctrl+Tab | Toggle Show Node Names |
| Ctrl+Shift+Tab | Toggle Show Edges |
| Ctrl+= | Fit View to Instances |

---

## 9. Save and Export

### Save Project (SLP)

1. File > Save (Ctrl+S)
2. Labels are serialized to SLP (HDF5) format via `saveSlpToBytes()`
3. File System Access API save picker shown when available (otherwise anchor download)
4. Toast notification confirms success
5. `hasChanges` flag is cleared

### Save As (SLP)

1. File > Save As... (Ctrl+Shift+S)
2. Always shows file picker (even if filename is known)
3. Suggested filename defaults to "labels.slp"
4. Saves in native SLP format

### Export JSON

1. File > Export JSON...
2. Labels data is serialized to JSON via `labels.toDict()`
3. Browser downloads the JSON file
4. Toast notification confirms success

### Export Analysis CSV

1. File > Export Analysis CSV (or via Export dialog)
2. CSV is generated with columns: video_filename, frame_idx, track_name, instance_type, node_name, x, y, score, visible
3. Browser downloads the CSV file
4. Toast notification confirms success

### Export Labels Package

1. File > Export Labels Package
2. A `.pkg.json` file is generated containing the full labels data plus a video manifest
3. Browser downloads the package file
4. Useful for sharing project data without the original video files

### Known Limitations

- ~~Cannot save as .slp~~ SLP save now works via `saveSlpToBytes()` from sleap-io.js
- **No Export HDF5** or Export NWB
- **JSON export cannot be re-imported** by SLEAP desktop

---

## 10. Seekbar Features

### Frame Range Selection

1. Hold Shift and click on the seekbar
2. Drag left or right to select a frame range
3. The selected range appears as a highlighted region on the seekbar
4. Release to finalize the selection
5. Click without Shift to clear the range selection
6. The range is used by "Delete Predictions from Clip" command

### Instance Count Header Graph

1. A bar chart above the seekbar shows the number of instances per frame
2. Each bar represents one frame; height corresponds to instance count
3. Helps identify frames with many/few annotations at a glance
4. Graph updates automatically as instances are added or removed

### Seekbar Marks

- Blue vertical lines for user-labeled frames
- Light blue vertical lines for prediction-only frames
- Colored horizontal bars showing track occupancy (one row per track)
- White vertical line for current frame position
- Blue highlight region for frame range selection (Shift+drag)

---

## 11. Suggestion Generation

### Generating Suggestions

1. Open the Suggestions panel tab
2. Select a method from the dropdown: "Stride" (evenly spaced) or "Random"
3. Enter the desired count (number of frames to suggest)
4. Click "Generate" button
5. Suggestions appear in the table, distributed across all videos

### Suggestion Table Features

1. Columns: #, Video, Frame, Score, Status
2. Click any column header to sort by that column
3. Click again to reverse sort direction
4. Score column shows mean prediction score for each suggested frame
5. Status shows whether a suggestion has been labeled
6. Click a row to navigate to that frame

### Navigating Suggestions

1. Space key advances to the next suggestion
2. Shift+Space goes to the previous suggestion
3. Clicking a row in the table navigates to that frame/video

---

## 12. Delete Prediction Variants

### Delete by Score Threshold

1. Labels > Delete Predictions with Low Score...
2. Enter a score threshold (e.g., 0.5)
3. All predicted instances with score below the threshold are removed
4. Toast notification shows count of deleted predictions
5. Operation is undoable

### Delete by Frame Range

1. Select a frame range on the seekbar (Shift+drag)
2. Labels > Delete Predictions from Clip...
3. All predicted instances within the frame range are removed
4. Operation is undoable

### Delete on User-Labeled Frames

1. Labels > Delete Predictions on User-Labeled Frames
2. On frames that have both user and predicted instances, predictions are removed
3. Useful for cleaning up overlapping predictions after labeling
4. Operation is undoable

### Delete by Max Count

1. Labels > Delete Predictions beyond Max per Frame...
2. Enter the maximum number of predictions to keep per frame
3. Lower-scoring predictions are removed, keeping only the top N
4. Operation is undoable

---

## 13. Training / Inference (Placeholders)

### Training Dialog

1. Predict > Training... from menu bar
2. `TrainingDialog` opens (shadcn/ui Dialog component)
3. Shows configuration options (non-functional, placeholder)
4. Info explains alternatives: SLEAP desktop, CLI, Colab
5. "Start Training" button is disabled

### Inference Dialog

1. Predict > Inference / Run Prediction... from menu bar
2. `InferenceDialog` opens (shadcn/ui Dialog component)
3. Shows configuration options (non-functional, placeholder)
4. "Run Inference" button is disabled

### Other Predict Menu Items

- **Export Training Package...** -- shows alert explaining future functionality
- **Import Predictions...** -- shows alert directing to File > Open Project
- **Visualize Model Outputs...** -- disabled with "Coming Soon" label

---

## 14. Side Panels

The sidebar uses a collapsible icon strip on the right edge with expandable panel content. Panel icons can be drag-reordered. The sidebar width is resizable (220-600px) via a drag handle.

### Videos Panel

- Lists all videos in the project
- Click a video row to switch to it
- Shows filename (truncated) and frame count
- "Add Videos" and "Remove Video" buttons exist but are stubs

### Skeleton Panel

- Nodes tab: lists all skeleton nodes, **double-click to rename inline**
- Edges tab: lists all edges (source -> destination)
- "New Node", "Delete Node", "New Edge", "Delete Edge" buttons work
- **Template dropdown** loads predefined skeletons (Fly, Mouse, Human, C. elegans, Custom)
- All skeleton operations are **undoable**

### Instances Panel

- Lists instances on current frame
- Shows type (User/Predicted), track, visible/total nodes, score
- Click row to select instance
- Color swatch matches instance color
- "Add Instance" and "Delete Instance" buttons work

### Suggestions Panel

- **Method dropdown** (Stride / Random) with count input and "Generate" button
- Lists suggested frames with sortable columns (#, Video, Frame, Score, Status)
- Click column header to sort ascending/descending
- Score shows mean prediction score for that frame
- Click row to navigate to that suggestion
- Previous/Next buttons cycle through suggestions
- "Clear Suggestions" removes all suggestions

---

## 15. Help and Keyboard Shortcuts

### Keyboard Shortcuts Dialog

1. Help > Keyboard Shortcuts...
2. Dialog opens showing all available keyboard shortcuts
3. Organized by category (File, Navigation, Editing, View, Tracks)
4. Shows key binding and action description

### About Dialog

1. Help > About SLEAP Label Web
2. Shows application name, version, and description
3. Links to GitHub repository and documentation

---

## 16. Delete Prediction Variants Dialog

The `DeletePredictionsDialog` (Labels > Delete Predictions...) provides a shadcn/ui Dialog with tabs for different deletion methods:

- **By Score Threshold**: Enter minimum score; predictions below are deleted
- **By Frame Range**: Uses seekbar range selection (Shift+drag); deletes predictions in range
- **On User-Labeled Frames**: Removes predictions from frames that also have user instances
- **By Max Count**: Keep only top N predictions per frame by score

All variants use multi-frame undo snapshots and show toast notifications with count of deleted predictions.

---

## Cross-References

- Enhancement proposals: `docs/enhancement-proposals.md`
- Missing features audit: `docs/missing-features-audit.md`
- UX audit: `docs/ux-audit.md`
- Tutorial flow analysis: `docs/tutorial-flow-analysis.md`
- Architecture: `docs/architecture.md`
