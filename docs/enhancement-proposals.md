# Enhancement Proposals

Prioritized list of proposed enhancements based on tutorial flow analysis,
guides/learnings analysis, UX audit, and missing features audit.

Last updated: 2026-02-28

---

## Priority Levels

- **P0**: Blocks core tutorial workflows (must have for MVP)
- **P1**: Significantly improves usability (important for beta)
- **P2**: Nice to have (polish/advanced features)
- **P3**: Future/aspirational

---

## P0 - Blocks Core Tutorial Workflows

### P0-1: Save As .slp Format

| Field | Value |
|-------|-------|
| **Description** | Users cannot save their work in the native .slp format. Current "Save" downloads JSON, which is incompatible with SLEAP desktop. This blocks Tutorials 3, 5, and 7 (every save point). |
| **Complexity** | L |
| **Tutorials** | 3 (Save), 5 (Save New Version), 7 (Save Corrected) |
| **Technical notes** | `sleap-io.js` `saveSlp` is Node-only. Options: (1) port HDF5 write to browser via h5wasm, (2) Tauri-only save via Node-compatible backend, (3) implement minimal SLP writer in JS. Option 2 is fastest path. |

### P0-2: Set Instance Track (Ctrl+1-9)

| Field | Value |
|-------|-------|
| **Description** | The core proofreading interaction. Users cannot assign tracks via keyboard shortcuts (Ctrl+1-9). This blocks the entire Tutorial 7 proofreading workflow. Currently only possible via right-click context menu. |
| **Complexity** | S |
| **Tutorials** | 7 (Correct Track Assignment) |
| **Technical notes** | Need: (1) dynamic Tracks > Set Instance Track submenu listing all tracks, (2) Ctrl+1 through Ctrl+9 shortcut handlers in `useKeyboardShortcuts`, (3) `SetSelectedInstanceTrack` command. |

### P0-3: Double-click Prediction to Convert

| Field | Value |
|-------|-------|
| **Description** | The central human-in-the-loop workflow. Users cannot convert a predicted instance to a user instance by double-clicking. This blocks Tutorial 5 (Correcting Predictions) and the entire active learning loop. |
| **Complexity** | S |
| **Tutorials** | 5 (Labeling from Predictions), Guides (prediction-assisted-labeling) |
| **Technical notes** | Add `onDoubleClick` handler in `VideoPlayer.tsx`. Hit test for predicted instance, clone as `Instance` (not `PredictedInstance`), add to `LabeledFrame`, select it. Should go through command system for undo. |

---

## P1 - Significantly Improves Usability

### P1-1: Generate Suggestions (Sample Method)

| Field | Value |
|-------|-------|
| **Description** | The "Generate Suggestions" button is a stub. Random/strided frame sampling is trivially implementable and enables Tutorial 3 (Initial Labeling) without any ML. |
| **Complexity** | S |
| **Tutorials** | 3 (Generate Suggestions) |
| **Technical notes** | Implement "sample" (random) and "stride" (evenly spaced) methods. Add method dropdown + count input to SuggestionsPanel. Wire "Generate" button to create `SuggestionFrame` objects. |

### P1-2: Trail Rendering

| Field | Value |
|-------|-------|
| **Description** | Track trail overlay is essential for proofreading (detecting identity swaps and lost identities). State exists (`trailLength`) but no canvas rendering or menu control. |
| **Complexity** | M |
| **Tutorials** | 7 (Configure Proofreading View, Find Identity Swaps) |
| **Technical notes** | For each visible instance, look back `trailLength` frames, find same-track instances, draw centroid-to-centroid lines with fading opacity. Add Trail Length submenu to View menu (0, 10, 50, 100, 250, 500). Render in `SkeletonRenderer.ts` or a dedicated trail layer. |

### P1-3: Next Track Spawn Frame Navigation

| Field | Value |
|-------|-------|
| **Description** | Navigate to the frame where a new track first appears. Critical for finding "lost identities" during proofreading. Shortcut (Ctrl+E) is defined but no command exists. |
| **Complexity** | S |
| **Tutorials** | 7 (Navigate to Track Switch), Guides (tracking-and-proofreading) |
| **Technical notes** | Iterate `labels.labeledFrames` to find the first frame where each track appears. Navigate to the next one after the current frame. |

### P1-4: Alt+Drag to Move Entire Instance

| Field | Value |
|-------|-------|
| **Description** | Hold Alt and drag a node to move all nodes in the instance simultaneously. Common labeling efficiency feature recommended in tutorials. |
| **Complexity** | S |
| **Tutorials** | 3 (Initial Labeling), 5 (Correcting Predictions) |
| **Technical notes** | In `VideoPlayer.tsx` drag handler, check `e.altKey`. If true, compute delta and apply to all points in the instance, not just the dragged node. |

### P1-5: Add Videos Button

| Field | Value |
|-------|-------|
| **Description** | The "Add Videos" button in VideosPanel only `console.log`s. Users cannot add videos to an existing project from the UI. |
| **Complexity** | S |
| **Tutorials** | 2 (Import Videos) |
| **Technical notes** | Wire to `showOpenFilePicker()` or `<input type="file">` for video files. Create Video object, add to `labels.videos`. |

### P1-6: `beforeunload` Handler

| Field | Value |
|-------|-------|
| **Description** | Closing the browser tab or refreshing with unsaved changes results in silent data loss. Need a `beforeunload` event handler. |
| **Complexity** | S |
| **Tutorials** | All (any save point) |
| **Technical notes** | Add `window.addEventListener("beforeunload", ...)` that checks `useAppStore.getState().hasChanges`. Already have unsaved changes check on project open, but not on tab close. |

### P1-7: Export Analysis CSV

| Field | Value |
|-------|-------|
| **Description** | Menu item exists but is disabled. CSV export is straightforward and enables Tutorial 8 (Export Results). |
| **Complexity** | M |
| **Tutorials** | 8 (Export Results) |
| **Technical notes** | Generate CSV with columns: video, frame, track, node, x, y, score, visible. Trigger browser download. |

### P1-8: Track Propagation

| Field | Value |
|-------|-------|
| **Description** | When reassigning a track, the change should propagate to all subsequent frames with the same old track. Without this, users must fix each frame individually during proofreading. |
| **Complexity** | M |
| **Tutorials** | 7 (Correct Track Assignment), Guides (tracking-and-proofreading) |
| **Technical notes** | Add `propagateTrackLabels` boolean to store. When enabled and a track is reassigned, iterate forward through `labeledFrames` and swap track references. |

### P1-9: Save As (JSON with File Picker)

| Field | Value |
|-------|-------|
| **Description** | "Save As" menu item is disabled. Even before .slp save is possible, users should be able to save JSON to a chosen location with an auto-incremented version number. |
| **Complexity** | S |
| **Tutorials** | 5 (Save New Version), 7 (Save New Version) |
| **Technical notes** | Use `showSaveFilePicker()` (browser) or Tauri dialog. Auto-suggest `filename.v002.json` based on current filename. |

### P1-10: Suggestion Score Column + Sorting

| Field | Value |
|-------|-------|
| **Description** | SuggestionsPanel has no score column and no sorting. Users cannot prioritize which suggestions to label first based on prediction confidence. |
| **Complexity** | S |
| **Tutorials** | 5 (Correcting Predictions) |
| **Technical notes** | Add score column showing mean prediction score for each suggested frame. Enable column header click to sort. |

### P1-11: Persistent Preferences

| Field | Value |
|-------|-------|
| **Description** | Closing the tab loses all view preferences (palette, edge style, marker size, etc.). These should persist across sessions. |
| **Complexity** | S |
| **Tutorials** | All (general UX) |
| **Technical notes** | Use `zustand/middleware` `persist` with `localStorage`. Persist view state keys only. |

### P1-12: Menu Item Enable/Disable Based on State

| Field | Value |
|-------|-------|
| **Description** | Many menu items (Delete Instance, Copy, Paste, etc.) are always clickable even when preconditions aren't met. Should be disabled with visual indication. |
| **Complexity** | M |
| **Tutorials** | All (general UX) |
| **Technical notes** | Subscribe to relevant store slices in menu components. Set `disabled` prop based on: instance selected, clipboard contents, project loaded, etc. |

### P1-13: Global Error Boundary

| Field | Value |
|-------|-------|
| **Description** | If any component throws during render, the entire app crashes with a white screen. Need a React Error Boundary to catch and display errors gracefully. |
| **Complexity** | S |
| **Tutorials** | All (reliability) |
| **Technical notes** | Create `ErrorBoundary` component wrapping `AppShell`. Show error message with "Reload" button. |

### P1-14: Ctrl+Hold Tracks Legend Overlay

| Field | Value |
|-------|-------|
| **Description** | When holding Ctrl with an instance selected, show a numbered track list with colors. This is how users know which number (Ctrl+1-9) to press during proofreading. |
| **Complexity** | S |
| **Tutorials** | 7 (Correct Track Assignment), Guides (tracking-and-proofreading) |
| **Technical notes** | Listen for `keydown`/`keyup` for Ctrl. When held and instance is selected, render semi-transparent overlay with colored track names numbered 1-N. |

---

## P2 - Nice to Have

### P2-1: Inline Node Rename in Skeleton Panel

| Field | Value |
|-------|-------|
| **Description** | Double-click a node name in the skeleton table to rename it in-place, matching SLEAP desktop behavior. Currently must delete and re-add. |
| **Complexity** | S |
| **Tutorials** | 2 (Configure Skeleton) |

### P2-2: Red/Green Node Coloring for Corrected Predictions

| Field | Value |
|-------|-------|
| **Description** | After converting a prediction to a user instance, nodes that have been moved show green, unchanged nodes show red. Visual feedback for labeling progress. |
| **Complexity** | M |
| **Tutorials** | 5 (Correcting Predictions) |

### P2-3: Seekbar Frame Range Selection

| Field | Value |
|-------|-------|
| **Description** | Click-drag on seekbar to select a frame range, shown as highlighted region. Enables clip-based operations (delete predictions in range, export clip). |
| **Complexity** | M |
| **Tutorials** | 7 (Proofreading), various delete prediction commands |

### P2-4: Help Menu

| Field | Value |
|-------|-------|
| **Description** | Add Help menu with documentation link, GitHub link, keyboard shortcuts dialog, and About dialog. |
| **Complexity** | S |
| **Tutorials** | 9 (Next Steps) |

### P2-5: Skeleton Template Loading

| Field | Value |
|-------|-------|
| **Description** | The skeleton template dropdown exists but logs to console. Wire to actual template definitions (Fly 32, Mouse 12, Human 17, etc.). |
| **Complexity** | M |
| **Tutorials** | 2 (Configure Skeleton) |

### P2-6: Node Label Size Menu Control

| Field | Value |
|-------|-------|
| **Description** | State exists (`nodeLabelSize`) but no menu item to control it. Add submenu to View menu. |
| **Complexity** | S |
| **Tutorials** | 3 (Labeling tips) |

### P2-7: Instance Rotation (Alt+Scroll)

| Field | Value |
|-------|-------|
| **Description** | Alt+scroll wheel on a node rotates the entire instance around its centroid. Useful for initial placement. |
| **Complexity** | M |
| **Tutorials** | 3 (Initial Labeling) |

### P2-8: Delete Prediction Variants

| Field | Value |
|-------|-------|
| **Description** | Multiple prediction deletion commands: by clip range, by score threshold, by max instances per frame, on user-labeled frames. Each needs a small dialog. |
| **Complexity** | M |
| **Tutorials** | Various (data cleanup) |

### P2-9: Pinch-to-Zoom

| Field | Value |
|-------|-------|
| **Description** | Support touch/trackpad pinch gesture for zooming. Important for laptop and tablet users. |
| **Complexity** | M |
| **Tutorials** | 3 (Labeling), 5 (Correction), 7 (Proofreading) |

### P2-10: Seekbar Header Graph

| Field | Value |
|-------|-------|
| **Description** | Time-series graph above seekbar showing metrics like point displacement, tracking scores, centroid proximity. Helps identify problem areas. |
| **Complexity** | L |
| **Tutorials** | 7 (Proofreading) |

### P2-11: Merge Data From Dialog

| Field | Value |
|-------|-------|
| **Description** | File > Merge Data From... for importing predictions from a separate SLP file into the current project with conflict resolution. |
| **Complexity** | L |
| **Tutorials** | Guides (importing-predictions-for-labeling) |

### P2-12: Export Labels Package

| Field | Value |
|-------|-------|
| **Description** | Export labeled frames + embedded video data as a .pkg.slp for remote training on Colab or CLI. |
| **Complexity** | L |
| **Tutorials** | 4, 5, 6 (Training workflow) |

---

## P3 - Future/Aspirational

### P3-1: Label Quality Control Panel

| Field | Value |
|-------|-------|
| **Description** | Automated detection of labeling errors using statistical methods (z-score outliers, GMM anomaly detection). Flag problematic instances, navigate to them, add to suggestions. |
| **Complexity** | XL |
| **Tutorials** | Guides (label-quality-control) |

### P3-2: Instance Size Distribution

| Field | Value |
|-------|-------|
| **Description** | Analysis widget showing scatter/histogram of instance bounding box sizes. Click-to-navigate to outliers. Useful for choosing training crop sizes. |
| **Complexity** | L |
| **Tutorials** | Guides (instance-size-distribution) |

### P3-3: Dockable/Rearrangeable Panels

| Field | Value |
|-------|-------|
| **Description** | Replace fixed panel layout with dockview or react-mosaic for user-customizable panel arrangement matching SLEAP desktop's Qt dock widgets. |
| **Complexity** | L |
| **Tutorials** | General UX |

### P3-4: Keyboard Shortcut Customization

| Field | Value |
|-------|-------|
| **Description** | Dialog to view and remap all keyboard shortcuts. Persist to localStorage. |
| **Complexity** | M |
| **Tutorials** | General UX |

### P3-5: sleap-nn Backend Integration

| Field | Value |
|-------|-------|
| **Description** | Connect to sleap-nn for actual training and inference. Could use WebSocket to a local Python process, or Tauri sidecar. |
| **Complexity** | XL |
| **Tutorials** | 4, 5, 6 (Training/Inference) |

### P3-6: Collaborative Labeling

| Field | Value |
|-------|-------|
| **Description** | Multiple users labeling the same project simultaneously via WebSocket sync. |
| **Complexity** | XL |
| **Tutorials** | N/A |

### P3-7: Import Formats (COCO, DLC, NWB)

| Field | Value |
|-------|-------|
| **Description** | Import data from other pose estimation tools. Useful for migration and interoperability. |
| **Complexity** | L (per format) |
| **Tutorials** | Guides (system overview) |

### P3-8: Video Clip Export with Annotations

| Field | Value |
|-------|-------|
| **Description** | Render video frames with skeleton overlays to a downloadable video file. Could use MediaRecorder API or ffmpeg.wasm. |
| **Complexity** | XL |
| **Tutorials** | View menu (Render Video Clip with Instances) |

---

## Implementation Phases

### Phase 1: Core Labeling Loop (Tutorials 2-3)
- P1-5: Add Videos button
- P1-1: Generate Suggestions (sample method)
- P0-3: Double-click prediction to convert
- P1-4: Alt+drag whole instance

### Phase 2: Save/Export (Tutorials 3, 5, 7, 8)
- P1-9: Save As (JSON with file picker)
- P0-1: Save As .slp format
- P1-7: Export Analysis CSV
- P1-6: `beforeunload` handler

### Phase 3: Proofreading (Tutorial 7)
- P0-2: Set Instance Track (Ctrl+1-9)
- P1-14: Ctrl+hold tracks legend
- P1-3: Next Track Spawn Frame
- P1-2: Trail rendering
- P1-8: Track propagation

### Phase 4: Polish
- P1-11: Persistent preferences
- P1-12: Menu enable/disable
- P1-13: Error Boundary
- P2 items as time permits

---

## Cross-References

- Tutorial flow analysis: `docs/tutorial-flow-analysis.md`
- Guides and learnings analysis: `docs/guides-and-learnings-analysis.md`
- UX audit: `docs/ux-audit.md`
- Missing features audit: `docs/missing-features-audit.md`
- Architecture: `docs/architecture.md`
- User flows: `docs/user-flows.md`
- SLEAP GUI reference: `docs/sleap-gui-features.md`
