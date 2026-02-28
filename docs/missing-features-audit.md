# Missing Features Audit: SLEAP GUI vs SLEAP Label Web

Comprehensive comparison of the SLEAP Qt desktop GUI (`sleap/gui/`) against the current
web implementation (`sleap-label-web/`). Focused on UI/UX features; ML/training features
are noted but deprioritized.

Last updated: 2026-02-28

---

## Summary

The web version has a solid foundation: SLP file loading, video playback, skeleton
rendering, node dragging, instance selection, undo/redo, keyboard shortcuts, menus,
toast notifications, loading indicators, dialogs, trail rendering, CSV export,
skeleton templates, prediction conversion, track assignment, and persistent preferences.

**Implemented**: ~65% of SLEAP GUI features
**Missing (feasible for web)**: ~15%
**Infeasible for web (training/GPU)**: ~20%

---

## 1. File Menu

### Implemented
| Feature | Status | Notes |
|---------|--------|-------|
| New Project | Done | Resets state, unsaved changes confirmation |
| Open Project (.slp) | Done | Consolidated `loadProject.ts` with unsaved changes check, loading indicator, toast |
| Save (as JSON) | Done | Downloads JSON via blob URL, Tauri native save dialog |
| Save As (JSON with file picker) | **NEW** | `SaveAsJsonCommand` with `showSaveFilePicker()`, auto-versioned filenames |
| Export JSON | Done | Same as Save currently |
| Export Analysis CSV | **NEW** | `ExportCSVCommand` generates CSV with video, frame, track, node, x, y, score, visible |
| Export Labels Package | **NEW** | `ExportPackageCommand` exports `.pkg.json` with video manifest |
| Quit | Done | `window.close()` |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Save As... (to .slp)** | P0 | Medium | Requires browser-compatible HDF5 writer. Tauri saves JSON to .slp path as interim. |
| **Import COCO dataset** | P3 | Medium | Need COCO JSON parser |
| **Import DeepLabCut dataset** | P3 | Medium | DLC CSV/YAML parser needed |
| **Import NWB dataset** | P3 | Hard | NWB/HDF5 format |
| **Import Analysis HDF5** | P2 | Medium | HDF5 reading via h5wasm |
| **Merge into Project** | P2 | Medium | Need merge logic (skeleton matching, conflict resolution dialog) |
| **Add Videos** | P1 | Easy | File picker for video files, add to labels.videos |
| **Replace Videos** | P1 | Easy | File picker to remap video paths |
| **Remove Video** | P1 | Easy | Remove from labels.videos with confirmation |
| **Export Analysis HDF5** | P2 | Medium | HDF5 writing via h5wasm |
| **Export NWB** | P3 | Hard | NWB format writer needed |
| **Reset preferences** | P2 | Easy | Clear localStorage |

---

## 2. Go Menu

### Implemented
| Feature | Status |
|---------|--------|
| Next/Previous Labeled Frame | Done |
| Next/Previous Suggestion | Done |
| Last Interacted Frame | Done |
| Next User Labeled Frame | Done |
| Next/Previous Video | Done |
| Select Next Instance | Done |
| Clear Selection | Done |
| Go to Frame... (dialog) | Done |
| Next Track Spawn Frame | **NEW** |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Select to Frame... (dialog)** | P2 | Easy | Input dialog to set frame range selection |

---

## 3. View Menu

### Implemented
| Feature | Status |
|---------|--------|
| Fit View to Instances | Done |
| Color Predicted Instances | Done |
| Color Palette picker | Done |
| Show Instances (H) | Done |
| Show Non-Visible Nodes | Done |
| Show Node Names | Done |
| Show Edges | Done |
| Edge Style (Line/Wedge) | Done |
| Node Marker Size (slider) | Done |
| Node Label Size control | **NEW** |
| Trail Length options | **NEW** |
| Track trail overlay | **NEW** |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Fit View to Selection** | P2 | Easy | Auto-zoom to selected instance only |
| **Apply Distinct Colors To** (instances/nodes/edges) | P2 | Easy | State exists but no menu item |
| **Trail Shade** options | P2 | Medium | Additional trail appearance controls |
| **Render Video Clip with Instances** | P3 | Hard | Need canvas-to-video export |
| **Dock panel visibility toggles** | P2 | Easy | Show/hide individual panels |

---

## 4. Labels Menu

### Implemented
| Feature | Status |
|---------|--------|
| Add Instance | Done |
| Delete Instance | Done |
| Copy/Paste Instance | Done |
| Delete Predictions on Current Frame | Done |
| Delete All Predictions | Done |
| Double-click prediction to convert | **NEW** |
| Delete Predictions with Low Score | **NEW** |
| Delete Predictions from Clip (range) | **NEW** |
| Delete Predictions on User-Labeled Frames | **NEW** |
| Delete Predictions beyond Max per Frame | **NEW** |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Instance Placement Method** submenu | P2 | Medium | Best, Average, Force Directed, Random, Copy Prior, Copy Predictions |
| **Custom Instance Delete dialog** | P2 | Medium | Dialog with type/frame/track filter options |
| **Extract Clip and Labels** | P3 | Hard | Export frame range + labels subset |
| **Add Instances from All Predictions** | P2 | Easy | Convert all unused predictions on current frame |
| **Delete Predictions in Area** | P3 | Medium | Draw rectangle, delete within area |

---

## 5. Tracks Menu

### Implemented
| Feature | Status |
|---------|--------|
| New Track (Ctrl+0) | Done |
| Transpose Instance Tracks | Done |
| Copy/Paste Instance Track | Done |
| Set Instance Track (Ctrl+1-9) | **NEW** |
| Propagate Track Labels | **NEW** |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Delete Instance and Track** | P2 | Easy | Delete selected instance + all instances in that track |
| **Delete Track** submenu | P2 | Easy | Delete a specific track |
| **Delete Multiple Tracks** (Unused/All) | P2 | Easy | Bulk track cleanup |
| **Set Track Name** (rename) | P2 | Easy | Editable track names |

---

## 6. Predict Menu

### Implemented
| Feature | Status | Notes |
|---------|--------|-------|
| Run Training... (placeholder) | Done | `TrainingDialog.tsx` with "Coming Soon" badge |
| Run Inference... (placeholder) | Done | `InferenceDialog.tsx` with "Coming Soon" badge |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| Run Training (actual) | N/A | Infeasible | Requires GPU, Python |
| Run Inference (actual) | N/A | Infeasible | Requires GPU, Python |
| Evaluation Metrics | P2 | Medium | Could display pre-computed metrics |

---

## 7. Analyze Menu (entirely missing)

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Instance Size Distribution** | P3 | Medium | Statistics dialog with histogram |
| **Label QC** | P3 | Medium | Quality control dock |

---

## 8. Help Menu -- NEW

| Feature | Status | Notes |
|---------|--------|-------|
| Keyboard Shortcuts dialog | **NEW** | `ShortcutsDialog.tsx` lists all keyboard shortcuts |
| About dialog | **NEW** | `HelpDialog.tsx` with version info |
| GitHub link | **NEW** | Opens repository URL |
| Documentation link | **NEW** | Opens docs URL |

---

## 9. Panels / Dock Widgets

### Implemented
| Panel | Status | Notes |
|-------|--------|-------|
| Videos Panel | Done | Basic list of videos |
| Skeleton Panel | Done | Node/edge editing, **inline rename**, **template loading**, **undo support** |
| Instances Panel | Done | Instance list with selection |
| Suggestions Panel | Done | **Method dropdown** (stride/random), **score column**, **sortable headers** |

### Missing Panel Features

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Videos Panel: Add/Remove Video** | P1 | Easy | Button functionality |
| **Videos Panel: Show Video info** | P2 | Easy | Dimensions, frames columns |
| **Skeleton Panel: Load from File** | P2 | Easy | File picker for skeleton JSON |
| **Skeleton Panel: Save As** | P2 | Easy | Export skeleton to JSON |
| **Skeleton Panel: Node Symmetry** | P3 | Medium | Set symmetry pairs |
| **Suggestions Panel: Add Current Frame** | P2 | Easy | Button to add current frame |
| **Suggestions Panel: Remove Suggestion** | P2 | Easy | Remove selected suggestion |
| **Dockable/rearrangeable panels** | P3 | Medium | dockview or react-mosaic |

---

## 10. Video Player / Canvas Features

### Implemented
| Feature | Status |
|---------|--------|
| Frame display | Done |
| Instance rendering (nodes, edges, labels) | Done |
| Zoom (mouse wheel) | Done |
| Pan (middle-click) | Done |
| Reset view (double-click) | Done |
| Instance selection (click) | Done |
| Node dragging | Done |
| Node placement mode | Done |
| Selection bounding box | Done |
| Right-click context menu | Done |
| Playback (play/pause, speed control) | Done |
| Double-click predicted instance to convert | **NEW** |
| Alt+drag to move entire instance | **NEW** |
| Instance rotation (Alt+scroll) | **NEW** |
| Pinch-to-zoom | **NEW** |
| Undo for drag and placement (BeginEdit) | **NEW** |
| Trail rendering overlay | **NEW** |
| Tracks legend overlay (Ctrl hold) | **NEW** |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Shift+double-click to convert and mark complete** | P3 | Easy | Convert + mark all nodes complete |
| **Ctrl+click to duplicate instance** | P3 | Easy | Clone instance at click location |
| **Instance highlighting (navigated-to)** | P2 | Easy | Cyan box when navigating to instance |
| **Area selection on canvas** | P3 | Medium | Draw rectangle for area-based operations |

---

## 11. Dialogs

### Implemented
| Dialog | Status | Notes |
|--------|--------|-------|
| Go to Frame | Done | `GoToFrameDialog.tsx` |
| Training Configuration | Done | `TrainingDialog.tsx` placeholder |
| Inference Configuration | Done | `InferenceDialog.tsx` placeholder |
| Delete Predictions dialog | **NEW** | `DeletePredictionsDialog.tsx` - score threshold, frame range, max count, labeled frames |
| Export dialog | **NEW** | `ExportDialog.tsx` - CSV and package export options |
| Keyboard Shortcuts | **NEW** | `ShortcutsDialog.tsx` - full shortcut reference table |
| About / Help | **NEW** | `HelpDialog.tsx` - version info and links |

### Missing

| Dialog | Priority | Feasibility | Notes |
|--------|----------|-------------|-------|
| **Custom Delete dialog** | P2 | Medium | Filter options for batch delete |
| **Merge Project dialog** | P3 | Hard | Skeleton mapping, conflict resolution |
| **Missing Files dialog** | P2 | Medium | Locate missing video files |
| **Import Videos dialog** | P2 | Medium | Video import wizard |
| **Export Clip dialog** | P3 | Hard | Configure fps, scale, crop |

---

## 12. Cross-Cutting Concerns

### Implemented
| Feature | Status | Notes |
|---------|--------|-------|
| Toast/notification system | Done | Sonner integration |
| Loading indicator | Done | During file load |
| Unsaved changes check on open | Done | `loadProject.ts` |
| Consolidated file loading | Done | Single entry points |
| Multi-frame undo | Done | `takeAllFramesSnapshot()` |
| Store-driven dialog management | Done | Boolean state for each dialog |
| shadcn/ui component library | Done | Full component set |
| Global Error Boundary | **NEW** | `ErrorBoundary.tsx` |
| Persistent preferences | **NEW** | Zustand persist + localStorage |
| Menu item enable/disable | **NEW** | State-based disabled props |
| Skeleton undo/redo | **NEW** | `installSkeletonUndoInterceptor` |
| Context menu viewport clamping | **NEW** | Menu clamped to viewport bounds |
| Seekbar frame range selection | **NEW** | Shift+drag to select range |
| Seekbar header graph | **NEW** | Instance count bar chart |

### Still Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **`beforeunload` handler** | P1 | Easy | Warn on tab close/refresh with unsaved changes |
| **Window title with filename** | P2 | Easy | `document.title = filename` |
| **Accessibility improvements** | P3 | Medium | ARIA labels, keyboard nav |
| **Responsive design** | P3 | Medium | Adapt layout for small screens |

---

## 13. Other Missing Features

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Keyboard shortcut customization** | P3 | Medium | Store custom shortcuts, edit via dialog |

---

## Priority Summary

### P0 - Critical (blocking core workflows)
1. **Save As to .slp format** - Users need to save work in native format

### P1 - Important (significant UX gaps)
1. `beforeunload` handler for tab close
2. Add/Remove Videos

### P2 - Nice to Have
1. Import formats (COCO, DLC, NWB, HDF5)
2. Export formats (NWB, HDF5)
3. Instance Placement Methods
4. Instance highlighting on navigation
5. Window title with filename
6. Missing video files dialog
7. Custom Delete dialog
8. Fit View to Selection
9. Distinct Colors To
10. Dock panel visibility toggles

### P3 - Future/Aspirational
1. Size Distribution analysis
2. Label QC dock
3. Render Video Clip with Instances
4. Area selection on canvas
5. Dockable panel layout
6. Keyboard shortcut customization
7. Import/Export formats
8. Collaborative labeling
9. sleap-nn backend integration

### Infeasible for Web
- Run Training (requires GPU, Python)
- Run Inference (requires GPU, Python)
- Confidence map / PAF overlays (requires inference)
- Suggestion generation methods that require ML (image_features, prediction_score, velocity)
