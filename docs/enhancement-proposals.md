# Enhancement Proposals

Prioritized list of proposed enhancements based on tutorial flow analysis,
guides/learnings analysis, UX audit, and missing features audit.

Last updated: 2026-03-04

---

## Priority Levels

- **P0**: Blocks core tutorial workflows (must have for MVP)
- **P1**: Significantly improves usability (important for beta)
- **P2**: Nice to have (polish/advanced features)
- **P3**: Future/aspirational

---

## Completed Items

The following enhancements have been implemented and are available in the current build.

### P0 (Core Tutorial Workflow Blockers)

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| P0-1 | Save As .slp Format | **DONE** | `saveSlpToBytes()` from sleap-io.js v0.2.0 works in browser via h5wasm. `saveProject.ts` uses File System Access API with anchor fallback. Custom `slpWriter.ts` removed. |
| P0-2 | Set Instance Track (Ctrl+1-9) | **DONE** | Dynamic track assignment via Ctrl+1-9 shortcuts. `SetInstanceTrack` command in `trackCommands.ts`. |
| P0-3 | Double-click Prediction to Convert | **DONE** | `ConvertPredictionToInstance` command. Double-click handler in `VideoPlayer.tsx` converts predicted instances to user instances via the command system with undo support. |

### P1 (Significantly Improves Usability)

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| P1-1 | Generate Suggestions (Sample Method) | **DONE** | "stride" (evenly spaced) and "random" sampling methods in `SuggestionsPanel.tsx`. Method dropdown + count input. |
| P1-2 | Trail Rendering | **DONE** | `TrailRenderer.ts` draws centroid-to-centroid polylines with fading opacity per track. Trail Length submenu in View menu (0, 10, 50, 100, 250, 500). |
| P1-3 | Next Track Spawn Frame Navigation | **DONE** | `GoNextTrackSpawnFrame` command in `navCommands.ts`. Finds first appearance of each track, navigates to the next spawn frame. Bound to Ctrl+E. |
| P1-4 | Alt+Drag to Move Entire Instance | **DONE** | Alt+drag in `VideoPlayer.tsx` moves all points by delta. Uses `lastDragPos` ref for delta calculation. |
| P1-7 | Export Analysis CSV | **DONE** | `ExportCSVCommand` in `fileCommands.ts`. `generateCSV()` in `exportUtils.ts` produces CSV with video, frame, track, node, x, y, score, visible columns. |
| P1-8 | Track Propagation | **DONE** | `PropagateTrackLabels` command in `trackCommands.ts`. When reassigning a track, propagates the change to subsequent frames. Multi-frame undo snapshot. |
| P1-9 | Save As (JSON with File Picker) | **DONE** | `SaveAsJsonCommand` in `fileCommands.ts`. Uses `showSaveFilePicker()` (browser) or Tauri dialog. Auto-suggests versioned filename (e.g., `project.v002.json`). |
| P1-10 | Suggestion Score Column + Sorting | **DONE** | Score column showing mean prediction score in `SuggestionsPanel.tsx`. Clickable column headers sort by index, video, frame, or score. |
| P1-11 | Persistent Preferences | **DONE** | Zustand `persist` middleware with `localStorage`. Persists palette, edgeStyle, markerSize, nodeLabelSize, trailLength, colorPredicted, showInstances, showLabels, showEdges, showNonVisibleNodes. |
| P1-12 | Menu Item Enable/Disable Based on State | **DONE** | Menu items subscribe to store state. Items disabled when preconditions not met (e.g., Delete Instance disabled when no instance selected, Paste disabled when clipboard empty, navigation disabled when no project loaded). |
| P1-13 | Global Error Boundary | **DONE** | `ErrorBoundary.tsx` wraps `AppShell`. Shows error message with "Reload" button. Dev mode shows stack trace. |
| P1-14 | Ctrl+Hold Tracks Legend Overlay | **DONE** | `TracksLegend.tsx` shows numbered track list with color swatches when Ctrl is held. |

### P2 (Nice to Have)

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| P2-1 | Inline Node Rename in Skeleton Panel | **DONE** | Double-click a node name to rename in-place. `RenameNodeCommand` updates node and all instance point names. |
| P2-3 | Seekbar Frame Range Selection | **DONE** | Shift+click-drag on seekbar to select a frame range. Used by Delete Predictions by Range. |
| P2-4 | Help Menu | **DONE** | Help menu with Keyboard Shortcuts dialog (`ShortcutsDialog.tsx`), About dialog (`HelpDialog.tsx`), GitHub link, and documentation link. |
| P2-5 | Skeleton Template Loading | **DONE** | `skeletonTemplates.ts` defines Fly (32 nodes), Mouse (12 nodes), Human (17 nodes), C. elegans (2 nodes), Custom (empty). `LoadSkeletonTemplateCommand` loads templates with undo support. |
| P2-6 | Node Label Size Menu Control | **DONE** | View > Node Label Size submenu with configurable sizes. |
| P2-7 | Instance Rotation (Alt+Scroll) | **DONE** | Alt+scroll wheel rotates selected user instance around its centroid (5 degrees per tick). `BeginEdit` snapshot for undo. |
| P2-8 | Delete Prediction Variants | **DONE** | Four new commands: `DeletePredictionsByScore`, `DeletePredictionsByRange`, `DeletePredictionsOnLabeledFrames`, `DeletePredictionsByMaxCount`. Each with dialog UI. |
| P2-9 | Pinch-to-Zoom | **DONE** | Trackpad pinch gesture detected via `ctrlKey` + wheel. Finer zoom steps for smooth pinch-to-zoom. |
| P2-10 | Seekbar Header Graph | **DONE** | Instance count header graph above seekbar showing number of instances per frame as a bar chart. |
| P2-12 | Export Labels Package | **DONE** | `ExportPackageCommand` in `fileCommands.ts`. Exports project as `.pkg.json` with video manifest and full labels data. |

---

## Remaining Items

### P1 - Significantly Improves Usability

#### P1-5: Add Videos Button

| Field | Value |
|-------|-------|
| **Description** | The "Add Videos" button in VideosPanel only `console.log`s. Users cannot add videos to an existing project from the UI. |
| **Complexity** | S |
| **Tutorials** | 2 (Import Videos) |
| **Technical notes** | Wire to `showOpenFilePicker()` or `<input type="file">` for video files. Create Video object, add to `labels.videos`. |

#### P1-6: `beforeunload` Handler

| Field | Value |
|-------|-------|
| **Description** | Closing the browser tab or refreshing with unsaved changes results in silent data loss. Need a `beforeunload` event handler. |
| **Complexity** | S |
| **Tutorials** | All (any save point) |
| **Technical notes** | Add `window.addEventListener("beforeunload", ...)` that checks `useAppStore.getState().hasChanges`. Already have unsaved changes check on project open, but not on tab close. |

---

### P2 - Nice to Have

#### P2-2: Red/Green Node Coloring for Corrected Predictions

| Field | Value |
|-------|-------|
| **Description** | After converting a prediction to a user instance, nodes that have been moved show green, unchanged nodes show red. Visual feedback for labeling progress. |
| **Complexity** | M |
| **Tutorials** | 5 (Correcting Predictions) |

#### P2-11: Merge Data From Dialog

| Field | Value |
|-------|-------|
| **Description** | File > Merge Data From... for importing predictions from a separate SLP file into the current project with conflict resolution. |
| **Complexity** | L |
| **Tutorials** | Guides (importing-predictions-for-labeling) |

---

### P3 - Future/Aspirational

#### P3-1: Label Quality Control Panel

| Field | Value |
|-------|-------|
| **Description** | Automated detection of labeling errors using statistical methods (z-score outliers, GMM anomaly detection). Flag problematic instances, navigate to them, add to suggestions. |
| **Complexity** | XL |

#### P3-2: Instance Size Distribution

| Field | Value |
|-------|-------|
| **Description** | Analysis widget showing scatter/histogram of instance bounding box sizes. Click-to-navigate to outliers. Useful for choosing training crop sizes. |
| **Complexity** | L |

#### P3-3: Dockable/Rearrangeable Panels

| Field | Value |
|-------|-------|
| **Description** | Replace fixed panel layout with dockview or react-mosaic for user-customizable panel arrangement. |
| **Complexity** | L |

#### P3-4: Keyboard Shortcut Customization

| Field | Value |
|-------|-------|
| **Description** | Dialog to view and remap all keyboard shortcuts. Persist to localStorage. |
| **Complexity** | M |

#### P3-5: sleap-nn Backend Integration

| Field | Value |
|-------|-------|
| **Description** | Connect to sleap-nn for actual training and inference. Could use WebSocket to a local Python process, or Tauri sidecar. |
| **Complexity** | XL |

#### P3-6: Collaborative Labeling

| Field | Value |
|-------|-------|
| **Description** | Multiple users labeling the same project simultaneously via WebSocket sync. |
| **Complexity** | XL |

#### P3-7: Import Formats (COCO, DLC, NWB)

| Field | Value |
|-------|-------|
| **Description** | Import data from other pose estimation tools. Useful for migration and interoperability. |
| **Complexity** | L (per format) |

#### P3-8: Video Clip Export with Annotations

| Field | Value |
|-------|-------|
| **Description** | Render video frames with skeleton overlays to a downloadable video file. Could use MediaRecorder API or ffmpeg.wasm. |
| **Complexity** | XL |

---

## Implementation Phases (Updated)

### Phase 1: Core Labeling Loop (Tutorials 2-3) -- COMPLETE
- ~~P1-5: Add Videos button~~ (still pending)
- ~~P1-1: Generate Suggestions (sample method)~~ DONE
- ~~P0-3: Double-click prediction to convert~~ DONE
- ~~P1-4: Alt+drag whole instance~~ DONE

### Phase 2: Save/Export (Tutorials 3, 5, 7, 8) -- COMPLETE
- ~~P1-9: Save As (JSON with file picker)~~ DONE
- ~~P0-1: Save As .slp format~~ DONE (sleap-io.js v0.2.0 `saveSlpToBytes`)
- ~~P1-7: Export Analysis CSV~~ DONE
- P1-6: `beforeunload` handler (still needed)

### Phase 3: Proofreading (Tutorial 7) -- COMPLETE
- ~~P0-2: Set Instance Track (Ctrl+1-9)~~ DONE
- ~~P1-14: Ctrl+hold tracks legend~~ DONE
- ~~P1-3: Next Track Spawn Frame~~ DONE
- ~~P1-2: Trail rendering~~ DONE
- ~~P1-8: Track propagation~~ DONE

### Phase 4: Polish -- COMPLETE
- ~~P1-11: Persistent preferences~~ DONE
- ~~P1-12: Menu enable/disable~~ DONE
- ~~P1-13: Error Boundary~~ DONE
- ~~P2 items~~ Most completed (see above)

---

## Progress Summary

| Priority | Total | Completed | Remaining |
|----------|-------|-----------|-----------|
| P0       | 3     | 3         | 0 |
| P1       | 14    | 12        | 2 (Add Videos, beforeunload) |
| P2       | 12    | 10        | 2 (Red/Green nodes, Merge dialog) |
| P3       | 8     | 0         | 8 |
| **Total**| **37**| **25**    | **12** |

---

## Cross-References

- Tutorial flow analysis: `docs/tutorial-flow-analysis.md`
- Guides and learnings analysis: `docs/guides-and-learnings-analysis.md`
- UX audit: `docs/ux-audit.md`
- Missing features audit: `docs/missing-features-audit.md`
- Architecture: `docs/architecture.md`
- User flows: `docs/user-flows.md`
- SLEAP GUI reference: `docs/sleap-gui-features.md`
