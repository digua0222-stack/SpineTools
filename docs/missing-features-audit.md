# Missing Features Audit: SLEAP GUI vs SLEAP Label Web

Comprehensive comparison of the SLEAP Qt desktop GUI (`sleap/gui/`) against the current
web implementation (`sleap-label-web/`). Focused on UI/UX features; ML/training features
are noted but deprioritized.

---

## Summary

The web version has a solid foundation: SLP file loading, video playback, skeleton
rendering, node dragging, instance selection, undo/redo, keyboard shortcuts, and basic
menus. However, many intermediate and advanced features from the Qt GUI are still missing.

**Implemented**: ~35% of SLEAP GUI features
**Missing (feasible for web)**: ~45%
**Infeasible for web (training/GPU)**: ~20%

---

## 1. File Menu

### Implemented
| Feature | Status | Notes |
|---------|--------|-------|
| New Project | Done | Resets state |
| Open Project (.slp) | Done | File System Access API + fallback |
| Save (as JSON) | Done | Downloads JSON via blob URL |
| Export JSON | Done | Same as Save currently |
| Quit | Done | `window.close()` |

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
| **Unsaved changes prompt on close** | P1 | Easy | `beforeunload` event + confirm dialog |

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

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Go to Frame... (dialog)** | P1 | Easy | Input dialog for frame number. Shortcut defined but no dialog implemented. |
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

## 6. Analyze Menu (entirely missing)

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Instance Size Distribution** | P2 | Medium | Statistics dialog with histogram, navigation to outlier instances |
| **Label QC** | P2 | Medium | Quality control dock: flag problematic labels, navigate to flagged frames |

---

## 7. Predict Menu (mostly infeasible for web)

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| Run Training | N/A | Infeasible | Requires GPU, Python, SLEAP training pipeline |
| Run Inference | N/A | Infeasible | Requires GPU, Python, trained models |
| Evaluation Metrics | P2 | Medium | Could display pre-computed metrics |
| Export Labels Package (various) | P1 | Medium | Useful for exporting data for training elsewhere |
| Train on Google Colab link | P2 | Easy | Just open URL |

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
| **Videos Panel: Toggle Grayscale** | P2 | Easy | Button to toggle grayscale rendering |
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
| **Instances Panel: New/Delete buttons** | Done | Already have Add/Delete |
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
| **Drag-and-drop file loading** | P1 | Easy | Accept .slp and video files dropped on window |
| **Double-click predicted instance to convert** | P1 | Easy | Convert to user instance |
| **Shift+double-click to convert and mark complete** | P2 | Easy | Convert + mark all nodes complete |
| **Alt+click to drag entire instance** | P1 | Easy | Move all nodes together |
| **Ctrl+click to duplicate instance** | P2 | Easy | Clone instance at click location |
| **Pinch-to-zoom** | P2 | Medium | Touch gesture support |
| **Instance highlighting (navigated-to)** | P1 | Easy | Cyan box when navigating to instance |
| **Seekbar frame marks** (user/predicted/track) | P0 | Medium | Visual marks on seekbar showing labeled frames. Critical for navigation context. |
| **Seekbar selection (click-drag)** | P1 | Medium | Select frame range for clip operations |
| **Seekbar track bars** | P2 | Medium | Colored horizontal bars showing track occupancy |
| **Area selection on canvas** | P2 | Medium | Draw rectangle for area-based operations |

---

## 11. Seekbar / Slider

### Implemented
| Feature | Status |
|---------|--------|
| Basic frame slider | Done |
| Current frame indicator | Done |
| Click to seek | Done |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Frame marks** (labeled frames) | P0 | Medium | Blue marks for user labels, light blue for predicted |
| **Track occupancy bars** | P2 | Medium | Colored bars showing which tracks appear in which frames |
| **Frame range selection** | P1 | Medium | Click-drag to select range, shown as blue highlight |
| **Header graph** | P2 | Hard | Time-series plot above seekbar (displacement, scores) |
| **Mark types** (simple, filled, open, predicted, tick) | P1 | Medium | Different visual indicators for different frame types |

---

## 12. Status Bar

### Implemented
| Feature | Status |
|---------|--------|
| Filename + unsaved indicator | Done |
| Frame index / total | Done |
| Labeled frames count | Done |
| Video count | Done |
| Instance count | Done |
| Instance type/track/score | Done |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Video X/Y indicator** | P2 | Easy | Which video out of total |
| **Frame range selection display** | P1 | Easy | "Selection: A-B (C frames)" |
| **Predicted frames count + percentage** | P1 | Easy | "Predicted Frames: N (X%)" |
| **Hidden instances warning** | P1 | Easy | Red text "Press H to toggle" when instances hidden |

---

## 13. Overlays

### Implemented
| Feature | Status |
|---------|--------|
| Instance overlay (nodes, edges, labels) | Done |

### Missing

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Track trail overlay** | P1 | Medium | Motion paths behind instances |
| **Track list overlay** (Ctrl+held) | P2 | Easy | Show track list with colors when Ctrl is held |
| **Confidence map overlay** | N/A | Infeasible | Requires inference output |
| **PAF overlay** | N/A | Infeasible | Requires inference output |

---

## 14. Dialogs

### Implemented
| Dialog | Status |
|--------|--------|
| (none as dedicated components) | Context menu serves as right-click dialog |

### Missing

| Dialog | Priority | Feasibility | Notes |
|--------|----------|-------------|-------|
| **Go to Frame dialog** | P1 | Easy | Simple number input |
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

## 15. Other Missing Features

| Feature | Priority | Feasibility | Notes |
|---------|----------|-------------|-------|
| **Persistent preferences** | P1 | Easy | localStorage or IndexedDB for view settings, shortcuts |
| **Window title with filename** | P1 | Easy | `document.title = filename` |
| **Menu item enable/disable based on state** | P1 | Medium | E.g., disable Delete Instance when nothing selected |
| **Keyboard shortcut customization** | P2 | Medium | Store custom shortcuts, edit via dialog |
| **Set Instance Track via Ctrl+1-9** | P0 | Easy | Map Ctrl+digit to track assignment |
| **Track propagation** | P1 | Medium | Apply track change to subsequent frames |

---

## Priority Summary

### P0 - Critical (blocking core workflows)
1. **Save As to .slp format** - Users need to save work in native format
2. **Set Instance Track (Ctrl+1-9)** - Core track editing workflow
3. **Seekbar frame marks** - Users need to see where labels exist

### P1 - Important (significant UX gaps)
1. Go to Frame dialog
2. Add/Remove Videos
3. Unsaved changes prompt
4. Seekbar frame range selection
5. Instance Placement Methods (Best, Average, Copy Prior, etc.)
6. Delete Instance and Track
7. Delete Track / Delete Multiple Tracks
8. Add Instances from All Predictions on Current Frame
9. Delete Predictions (clip, low score, max instances, user frames)
10. Trail overlay
11. Fit View to Selection
12. Distinct Colors To (instances/nodes/edges)
13. Node Label Size control
14. Drag-and-drop file loading
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
7. Track occupancy bars on seekbar
8. Render Video Clip with Instances
9. Area selection on canvas
10. Dockable panel layout
11. Skeleton templates
12. Keyboard shortcut customization
13. Pinch-to-zoom
14. Help menu links

### Infeasible for Web
- Run Training (requires GPU, Python)
- Run Inference (requires GPU, Python)
- Confidence map / PAF overlays (requires inference)
- Suggestion generation methods that require ML (image_features, prediction_score, velocity)

---

## Recommended Next Steps

1. **Seekbar frame marks** (P0) - Critical visual feedback for navigation
2. **Set Instance Track (Ctrl+1-9)** (P0) - Needed for any track editing workflow
3. **Save As .slp** (P0) - Blocked on sleap-io.js browser save support; may need Tauri-only path first
4. **Go to Frame dialog** (P1) - Simple dialog, unlocks keyboard workflow
5. **Unsaved changes prompt** (P1) - Prevent data loss
6. **Persistent preferences** (P1) - Store view settings across sessions
7. **Seekbar selection + frame range** (P1) - Unlocks clip operations
8. **Delete predictions variants** (P1) - Common data cleanup operations
9. **Instance Placement Methods** (P1) - Better new instance positioning
10. **Trail overlay** (P1) - Important for tracking review
