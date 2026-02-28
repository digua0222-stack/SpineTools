# Missing Features Audit: SLEAP GUI vs SLEAP Label Web

Comprehensive comparison of the SLEAP Qt desktop GUI (`sleap/gui/`) against the current
web implementation (`sleap-label-web/`). Focused on UI/UX features; ML/training features
are noted but deprioritized.

Last updated: 2026-02-28

---

## Summary

The web version has a solid foundation: SLP file loading, video playback, skeleton
rendering, node dragging, instance selection, undo/redo, keyboard shortcuts, menus,
toast notifications, loading indicators, and dialogs.

**Implemented**: ~40% of SLEAP GUI features
**Missing (feasible for web)**: ~40%
**Infeasible for web (training/GPU)**: ~20%

---

## 1. File Menu

### Implemented
| Feature | Status | Notes |
|---------|--------|-------|
| New Project | Done | Resets state |
| Open Project (.slp) | Done | Consolidated `loadProject.ts` with unsaved changes check, loading indicator, toast |
| Save (as JSON) | Done | Downloads JSON via blob URL |
| Export JSON | Done | Same as Save currently |
| Quit | Done | `window.close()` |

### Recently Completed
| Feature | Status | Notes |
|---------|--------|-------|
| **Unsaved changes prompt on open** | DONE | `loadProject.ts` checks `hasChanges` before loading |
| **Loading indicator during open** | DONE | `setLoading()` shows spinner during SLP parse |
| **Toast notifications for load** | DONE | Success/error toasts via `sonner` |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Save As... (to .slp)** | P0 | Medium | Requires sleap-io.js `saveSlp` (currently Node-only). Need browser-compatible SLP writer or Tauri backend. |
| **Save As... (file picker)** | P0 | Easy | File System Access API `showSaveFilePicker()` or Tauri dialog |
| **Import COCO dataset** | P2 | Medium | Need COCO JSON parser in sleap-io.js or custom |
| **Import DeepLabCut dataset** | P2 | Medium | DLC CSV/YAML parser needed |
| **Import NWB dataset** | P2 | Hard | NWB/HDF5 format, specialized |
| **Import Analysis HDF5** | P2 | Medium | HDF5 reading via h5wasm |
| **Merge into Project** | P1 | Medium | Need merge logic (skeleton matching, conflict resolution dialog) |
| **Add Videos** | P1 | Easy | File picker for video files, add to labels.videos |
| **Replace Videos** | P1 | Easy | File picker to remap video paths |
| **Remove Video** | P1 | Easy | Remove from labels.videos with confirmation |
| **Export Analysis HDF5** | P1 | Medium | HDF5 writing via h5wasm |
| **Export Analysis CSV** | P1 | Easy | Generate CSV from labels data, download |
| **Export NWB** | P2 | Hard | NWB format writer needed |
| **Reset preferences** | P2 | Easy | Clear localStorage |
| **Open Preferences Directory** | P2 | Desktop only | Tauri shell.open() |

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

### Recently Completed
| Feature | Status | Notes |
|---------|--------|-------|
| **Go to Frame... (dialog)** | DONE | `GoToFrameDialog.tsx` with number input, Ctrl+J shortcut, store-driven open/close |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Select to Frame... (dialog)** | P1 | Easy | Input dialog to set frame range selection |
| **Next Track Spawn Frame** | P1 | Easy | Find next frame where a new track begins. Shortcut defined but command not implemented. |

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

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Fit View to Selection** | P1 | Easy | Auto-zoom to selected instance only (state exists, logic not wired) |
| **Apply Distinct Colors To** (instances/nodes/edges) | P1 | Easy | State exists (`distinctlyColor`) but no menu item or renderer support |
| **Node Label Size** submenu/control | P1 | Easy | State exists (`nodeLabelSize`) but no menu control |
| **Trail Length** options | P1 | Medium | State exists but no trail rendering implemented |
| **Trail Shade** options | P1 | Medium | Depends on trail rendering |
| **Track trail overlay** | P1 | Medium | Canvas 2D trail lines behind instances, per-track colored paths |
| **Render Video Clip with Instances** | P2 | Hard | Need canvas-to-video export (MediaRecorder API or ffmpeg.wasm) |
| **Dock panel visibility toggles** | P1 | Easy | Show/hide individual panels from View menu |

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

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Instance Placement Method** submenu | P1 | Medium | Currently uses empty instance. Need: Best, Average, Force Directed, Random, Copy Prior Frame, Copy Predictions |
| **Custom Instance Delete dialog** | P2 | Medium | Dialog with type/frame/track filter options |
| **Extract Clip and Labels** | P2 | Hard | Export frame range + labels subset |
| **Extract Clip Labels Package** | P2 | Hard | Export as packaged SLP |
| **Add Instances from All Predictions** | P1 | Easy | Convert all unused predictions on current frame to user instances |
| **Delete Predictions from Clip** | P1 | Easy | Delete predictions in selected frame range |
| **Delete Predictions from Area** | P2 | Medium | Draw rectangle, delete predictions within area across frames |
| **Delete Predictions with Low Score** | P1 | Easy | Score threshold dialog |
| **Delete Predictions beyond Max Instances** | P1 | Easy | Instance count limit dialog |
| **Delete Predictions beyond Frame Limit** | P2 | Easy | Frame range dialog |
| **Delete Predictions on User-Labeled Frames** | P1 | Easy | Clean up overlapping predictions |
| **Double-click prediction to convert** | P1 | Easy | Click handler to convert PredictedInstance to Instance |

---

## 5. Tracks Menu

### Implemented
| Feature | Status |
|---------|--------|
| New Track (Ctrl+0) | Done |
| Transpose Instance Tracks | Done |
| Copy/Paste Instance Track | Done |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Set Instance Track** submenu (Ctrl+1-9) | P0 | Easy | Dynamic submenu listing tracks, assign via shortcut. Critical for track editing. |
| **Propagate Track Labels** toggle | P1 | Medium | Apply track changes to subsequent frames (same-track instances) |
| **Delete Instance and Track** | P1 | Easy | Delete selected instance + all instances in that track |
| **Delete Track** submenu | P1 | Easy | Delete a specific track, remove from all instances |
| **Delete Multiple Tracks** (Unused/All) | P1 | Easy | Bulk track cleanup |
| **Set Track Name** (rename) | P1 | Easy | Editable track names |
| **Seekbar Header** metric options | P2 | Hard | Time-series graph above seekbar (displacement, scores, etc.) |

---

## 6. Predict Menu

### Recently Completed
| Feature | Status | Notes |
|---------|--------|-------|
| **Run Training... (placeholder)** | DONE | `TrainingDialog.tsx` with model type, backbone, epochs config. "Coming Soon" badge. Links to alternatives. |
| **Run Inference... (placeholder)** | DONE | `InferenceDialog.tsx` with model, video, frame range, tracking config. "Coming Soon" badge. Links to alternatives. |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| Run Training (actual) | N/A | Infeasible | Requires GPU, Python, SLEAP training pipeline |
| Run Inference (actual) | N/A | Infeasible | Requires GPU, Python, trained models |
| Evaluation Metrics | P2 | Medium | Could display pre-computed metrics |
| Export Labels Package (various) | P1 | Medium | Useful for exporting data for training elsewhere |
| Train on Google Colab link | P2 | Easy | Just open URL |

---

## 7. Analyze Menu (entirely missing)

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Instance Size Distribution** | P2 | Medium | Statistics dialog with histogram, navigation to outlier instances |
| **Label QC** | P2 | Medium | Quality control dock: flag problematic labels, navigate to flagged frames |

---

## 8. Help Menu (entirely missing)

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Documentation link** | P2 | Easy | Open URL |
| **GitHub link** | P2 | Easy | Open URL |
| **Releases link** | P2 | Easy | Open URL |
| **Keyboard Shortcuts dialog** | P1 | Medium | Display current shortcuts, allow customization |
| **About dialog** | P2 | Easy | Version info |

---

## 9. Panels / Dock Widgets

### Implemented
| Panel | Status | Notes |
|-------|--------|-------|
| Videos Panel | Done | Basic list of videos |
| Skeleton Panel | Done | Node/edge editing |
| Instances Panel | Done | Instance list with selection |
| Suggestions Panel | Done | Basic suggestion list |

### Missing Panel Features

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Videos Panel: Remove Video** | P1 | Easy | Button in panel |
| **Videos Panel: Show Video info** (dimensions, frames) | P1 | Easy | Table columns |
| **Skeleton Panel: Load Template** | P1 | Medium | Dropdown of built-in skeletons with preview |
| **Skeleton Panel: Load from File** | P1 | Easy | File picker for skeleton JSON |
| **Skeleton Panel: Save As** | P1 | Easy | Export skeleton to JSON |
| **Skeleton Panel: Node Symmetry** | P2 | Medium | Set symmetry pairs |
| **Suggestions Panel: Add Current Frame** | P1 | Easy | Button to add current frame as suggestion |
| **Suggestions Panel: Remove Suggestion** | P1 | Easy | Remove selected suggestion |
| **Suggestions Panel: Clear All** | P1 | Easy | Clear with confirmation |
| **Suggestions Panel: Generate Suggestions** | P2 | Hard | Various methods (sample, image features, etc.) - some need ML |
| **Suggestions Panel: Labeled count display** | P1 | Easy | Show N/M labeled in status |
| **Dockable/rearrangeable panels** | P2 | Medium | Currently fixed layout; dockview or react-mosaic could enable this |

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

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Double-click predicted instance to convert** | P1 | Easy | Convert to user instance |
| **Shift+double-click to convert and mark complete** | P2 | Easy | Convert + mark all nodes complete |
| **Alt+click to drag entire instance** | P1 | Easy | Move all nodes together |
| **Ctrl+click to duplicate instance** | P2 | Easy | Clone instance at click location |
| **Pinch-to-zoom** | P2 | Medium | Touch gesture support |
| **Instance highlighting (navigated-to)** | P1 | Easy | Cyan box when navigating to instance |
| **Seekbar frame range selection** | P1 | Medium | Select frame range for clip operations |
| **Area selection on canvas** | P2 | Medium | Draw rectangle for area-based operations |

---

## 11. Dialogs

### Recently Completed
| Dialog | Status | Notes |
|--------|--------|-------|
| **Go to Frame** | DONE | `GoToFrameDialog.tsx` - number input, Enter to confirm, auto-fills current frame |
| **Training Configuration** | DONE | `TrainingDialog.tsx` - placeholder with model config UI |
| **Inference Configuration** | DONE | `InferenceDialog.tsx` - placeholder with video/tracking config UI |

### Missing

| Dialog | Priority | Feasibility | Notes |
|--------|----------|-------------|-------|
| **Select to Frame dialog** | P1 | Easy | Simple number input |
| **Keyboard Shortcuts dialog** | P1 | Medium | Table view + edit |
| **Custom Delete dialog** | P2 | Medium | Filter options for batch delete |
| **Merge Project dialog** | P2 | Hard | Skeleton mapping, conflict resolution |
| **Missing Files dialog** | P1 | Medium | Locate missing video files |
| **Import Videos dialog** | P1 | Medium | Video import wizard |
| **Export Clip dialog** | P2 | Hard | Configure fps, scale, crop |
| **Frame Range dialog** | P1 | Easy | Min/max frame input |
| **Score Threshold dialog** | P1 | Easy | Slider for score threshold |

---

## 12. Cross-Cutting Concerns

### Recently Completed
| Feature | Status | Notes |
|---------|--------|-------|
| **Toast/notification system** | DONE | Sonner integration for success/error feedback |
| **Loading indicator** | DONE | `isLoading`/`loadingMessage` in store, shown during file load |
| **Unsaved changes check on open** | DONE | `loadProject.ts` confirms before discarding |
| **Consolidated file loading** | DONE | Single `loadProjectFromFile()` / `loadProjectFromPath()` entry points |
| **Multi-frame undo** | DONE | `takeAllFramesSnapshot()` in CommandContext for bulk operations |
| **Store-driven dialog management** | DONE | `trainingDialogOpen`, `inferenceDialogOpen`, `goToFrameDialogOpen` in store |
| **shadcn/ui component library** | DONE | Dialog, Input, Select, Tabs, Badge, Button, etc. |

### Still Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **`beforeunload` handler** | P1 | Easy | Warn on tab close/refresh with unsaved changes |
| **Global Error Boundary** | P1 | Easy | Catch render errors gracefully |
| **Persistent preferences** | P1 | Easy | localStorage for view settings, shortcuts |
| **Menu item enable/disable based on state** | P1 | Medium | E.g., disable Delete Instance when nothing selected |
| **Window title with filename** | P1 | Easy | `document.title = filename` |
| **Accessibility improvements** | P2 | Medium | ARIA labels, keyboard nav, screen reader support |
| **Responsive design** | P2 | Medium | Adapt layout for small screens/tablets |

---

## 13. Other Missing Features

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Set Instance Track via Ctrl+1-9** | P0 | Easy | Map Ctrl+digit to track assignment |
| **Track propagation** | P1 | Medium | Apply track change to subsequent frames |
| **Keyboard shortcut customization** | P2 | Medium | Store custom shortcuts, edit via dialog |

---

## Priority Summary

### P0 - Critical (blocking core workflows)
1. **Save As to .slp format** - Users need to save work in native format
2. **Set Instance Track (Ctrl+1-9)** - Core track editing workflow
3. ~~Seekbar frame marks~~ - Seekbar now renders track occupancy bars and labeled frame marks

### P1 - Important (significant UX gaps)
1. ~~Go to Frame dialog~~ - DONE
2. Add/Remove Videos
3. ~~Unsaved changes prompt~~ - DONE (on open; still need `beforeunload`)
4. `beforeunload` handler for tab close
5. Seekbar frame range selection
6. Instance Placement Methods (Best, Average, Copy Prior, etc.)
7. Delete Instance and Track
8. Delete Track / Delete Multiple Tracks
9. Add Instances from All Predictions on Current Frame
10. Delete Predictions (clip, low score, max instances, user frames)
11. Trail overlay
12. Fit View to Selection
13. Distinct Colors To (instances/nodes/edges)
14. Node Label Size control
15. Dock panel visibility toggles
16. Keyboard Shortcuts dialog
17. Persistent preferences (localStorage)
18. Menu item enable/disable based on state
19. Status bar: frame range, predicted count, hidden warning
20. Suggestion management (add/remove/clear)
21. Merge into Project
22. Export Analysis CSV

### P2 - Nice to Have
1. Import formats (COCO, DLC, NWB, HDF5)
2. Export formats (NWB, HDF5)
3. Custom Delete dialog
4. Size Distribution analysis
5. Label QC dock
6. Seekbar header graph
7. Render Video Clip with Instances
8. Area selection on canvas
9. Dockable panel layout
10. Skeleton templates
11. Keyboard shortcut customization
12. Pinch-to-zoom
13. Help menu links

### Infeasible for Web
- Run Training (requires GPU, Python)
- Run Inference (requires GPU, Python)
- Confidence map / PAF overlays (requires inference)
- Suggestion generation methods that require ML (image_features, prediction_score, velocity)
