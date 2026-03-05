# Tutorial Flow Analysis: SLEAP Desktop vs sleap-label-web

Exhaustive mapping of every user action in the SLEAP tutorial docs to the current
state of sleap-label-web. Each tutorial step is analyzed for web UI coverage, gaps,
and what needs to be added.

---

## Tutorial 1: Setup

**Desktop flow**: Install SLEAP via conda, launch `sleap` command.

**Web equivalent**: Open browser to the web app URL (or launch Tauri desktop build).

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Install SLEAP | `mamba create -n sleap ...` | N/A | Web app is zero-install in browser |
| Launch GUI | `sleap` in terminal | Navigate to URL | DONE - WelcomeScreen renders on load |

**Notes**: No gaps here. The web app is inherently easier to set up -- no Python/conda needed.

---

## Tutorial 2: Importing Data

### 2a. Download Tutorial Data

**Desktop flow**: Clone `sleap-tutorial-data` git repo containing `mice.mp4`.

**Web equivalent**: User needs video files locally or via URL.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Clone tutorial data repo | Git CLI | N/A | Could provide a "Load Sample Data" button on WelcomeScreen |
| Have `mice.mp4` accessible | Local filesystem | Local filesystem | DONE - browser file picker works |

**Gap**: No built-in sample dataset loader. Users must supply their own files.

### 2b. Import Videos into SLEAP

**Desktop flow**: File > Add Videos... > browse to mice.mp4 > Import dialog > click Import.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| File > Add Videos... | Menu item opens file browser | **STUB** - VideosPanel has "Add Videos" button but it only `console.log`s | P1: Need working file picker to add videos to project |
| Browse to video file | Native file dialog | File System Access API available | Picker code exists in OpenProjectCommand but not for Add Videos |
| Video import dialog (grayscale toggle, format options) | Qt dialog with options | **MISSING** | P2: Import dialog with format options |
| Click Import to confirm | Button in dialog | **MISSING** | Part of import dialog |
| See video in GUI | Video renders in main canvas | DONE | Video frame rendering works |
| Drag-and-drop SLP file | Not in tutorial | DONE | AppShell has onDrop handler for .slp files |

**Critical gaps**:
- **Add Videos** button is a stub (`console.log`) -- needs real implementation
- No video import dialog (grayscale toggle, HDF5 dataset selection)
- No way to add videos to an existing project from the UI

### 2c. Configure Skeleton

**Desktop flow**: Skeleton tab > New Node (x3) > rename each node > Edges tab > add edges.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Click Skeleton tab | Side panel tab | DONE | `SkeletonPanel` tab exists |
| Click "New Node" button | Button in panel | DONE | "New Node" button opens dialog |
| Double-click node name to edit inline | Inline edit in table | DONE | Double-click on node name enables inline rename with duplicate validation |
| Press Enter to save name | Inline edit commit | N/A | Dialog has "Add" button |
| Create 3 nodes (head, torso, tail_base) | Repeat node creation | DONE | Works via repeated dialog use |
| Switch to Edges tab | Tab within Skeleton panel | DONE | Nodes/Edges tabs exist |
| Add edge: torso -> head | Dropdown selectors | DONE | "New Edge" dialog with source/destination selects |
| Add edge: torso -> tail_base | Same | DONE | Same flow |
| See final skeleton structure | Node/edge tables | DONE | Tables show nodes and edges |

**Gaps**:
- ~~Inline node rename~~: DONE -- Double-click to rename in-place with validation
- ~~Load skeleton template~~: DONE -- Dropdown loads Fly, Mouse, Human, C. elegans, Custom templates
- Tutorial tip mentions View > Edge Style > Wedge: **DONE** (View menu has edge style radio)
- Tutorial tip mentions View > Node Marker Size > 12: **DONE** (View menu has slider)
- Tutorial tip mentions View > Node Label Size > 18: **DONE** -- View > Node Label Size submenu with Small/Medium/Large/XL options

---

## Tutorial 3: Initial Labeling

### 3a. Generate Suggestions

**Desktop flow**: Labeling Suggestions tab > set Method=sample, Samples=50 > Generate Suggestions.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Switch to Labeling Suggestions tab | Side panel tab | DONE | `SuggestionsPanel` tab exists |
| Set Method dropdown to "sample" | Dropdown in panel | DONE | Method dropdown with "Stride" and "Random" options |
| Set "Samples Per Video" to 50 | Number input | DONE | Count input field in panel |
| Click "Generate Suggestions" | Button triggers generation | DONE | Generate button creates suggestions distributed across videos |
| See populated suggestion list | Table of frame suggestions | DONE | SuggestionsPanel renders suggestion rows when data exists |

**Status**: Generate Suggestions is now fully functional with "Stride" (evenly spaced) and "Random" sampling methods. Advanced methods (image_features, prediction_score, velocity) still require ML -- need placeholder.

### 3b. Labeling the First Frame

**Desktop flow**: Double-click suggestion > right-click > Default > drag nodes > repeat for 2nd animal.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Double-click suggestion to navigate | Click row in table | DONE | SuggestionsPanel `onNavigate` sets video + frameIdx |
| Right-click on video > "Default" to add instance | Context menu > Add Instance | DONE | ContextMenu has "Add Instance" option |
| See new instance with NaN nodes | Instance created with empty points | DONE | `AddInstance` command creates `Instance.empty()` |
| Drag nodes to correct positions | Mouse drag on canvas | DONE | Node dragging works in VideoPlayer |
| Node placement mode (click to place NaN nodes) | Click canvas to place | DONE | `isPlacingNodes` mode with visual indicator badge |
| Zoom with scroll wheel | Mouse wheel zoom | DONE | `handleWheel` in VideoPlayer |
| Pinch-to-zoom | Touch gesture | DONE | Trackpad pinch via Ctrl+scroll detection |
| Add second instance (right-click > Default) | Same as first | DONE | Works |
| Drag nodes for second animal | Same as first | DONE | Works |
| Alt+drag to move entire instance | Alt modifier + drag | DONE | Alt+drag moves all visible nodes by delta |
| Alt+scroll to rotate instance | Alt + scroll wheel | DONE | Alt+scroll rotates around centroid (5 deg/tick) |
| Cmd/Win+click to duplicate instance | Modifier + click | **MISSING** | P2: No click-to-duplicate |

**Gaps**:
- ~~Alt+drag whole instance~~: DONE
- ~~Alt+scroll rotate~~: DONE
- **Cmd+click duplicate**: Tutorial recommends -- not implemented

### 3c. Save the Project

**Desktop flow**: File > Save > dialog > Save button.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| File > Save | Menu item | DONE | `SaveProjectCommand` saves as SLP via `saveSlpToBytes()` |
| Save dialog with path | Native file dialog | DONE | File System Access API save picker (with anchor download fallback) |
| Cmd+S shortcut | Keyboard shortcut | DONE | Shortcut defined and wired |
| File saved as `.slp` | Native SLP format | DONE | `saveSlpToBytes()` from sleap-io.js serializes to HDF5/SLP |

**Status**: Save as .slp is now fully functional. `saveSlpToBytes()` from sleap-io.js v0.2.0+ enables browser-side SLP serialization. File System Access API provides native save picker. Save As also works for saving to a new location.

---

## Tutorial 4: Training a Model

**Desktop flow**: Predict > Run Training... > configure pipeline > configure centroid model > configure centered instance model > Run.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Predict menu > Run Training... | Opens training dialog | DONE (placeholder) | Predict > Training... opens TrainingDialog with "Coming Soon" badge |
| Training Pipeline tab | Tab in training dialog | **MISSING** | Dialog exists but no tabbed configuration UI |
| Set Sigma for Centroids = 3 | Slider/input | **MISSING** | N/A for web (training is server-side) |
| Set Anchor Part = torso | Dropdown | **MISSING** | N/A for web |
| Centroid Model Configuration tab | Tab in training dialog | **MISSING** | N/A |
| Set Input Scaling = 0.25 | Slider/input | **MISSING** | N/A |
| Set Epochs = 5 | Number input | **MISSING** | N/A |
| Set Rotation = 180 | Slider/input | **MISSING** | N/A |
| Centered Instance Model Configuration tab | Tab in dialog | **MISSING** | N/A |
| Set Epochs = 5 | Number input | **MISSING** | N/A |
| Set Rotation = 180 | Slider/input | **MISSING** | N/A |
| Click Run | Button starts training | **MISSING** | N/A |
| See training progress (loss, preview) | Progress dialog | **MISSING** | N/A |
| Auto-inference on suggestions after training | Automatic | **MISSING** | N/A |

**Status**: Training/inference is fundamentally infeasible in the browser -- requires GPU, Python, and the sleap-nn backend.

**Status**: Predict menu now exists with placeholder dialogs:
- **Predict > Training...** opens `TrainingDialog` with informational content
- **Predict > Inference / Run Prediction...** opens `InferenceDialog` with informational content
- **Predict > Export Training Package...** shows alert (implementation pending)
- **Predict > Import Predictions...** directs to File > Open Project
- **Predict > Visualize Model Outputs...** disabled with "Coming Soon" label

---

## Tutorial 5: Correcting Predictions

### 5a. Save a New Version

**Desktop flow**: File > Save As... > auto-incremented filename > Save.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| File > Save As... | Menu item | DONE | `SaveAsProjectCommand` saves as SLP with file picker |
| Auto-increment version (v001 -> v002) | Auto in dialog | DONE (for JSON) | `suggestSaveFilename()` auto-increments version for JSON exports |
| Cmd+Shift+S shortcut | Keyboard shortcut | DONE | Wired to `SaveAsProjectCommand` |

**Status**: Save As now works for both SLP and JSON formats.

### 5b. Labeling from Predictions

**Desktop flow**: Navigate suggestions > double-click predicted instance to convert > adjust nodes.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Navigate between suggestions (Space/Shift+Space) | Keyboard shortcuts | DONE | `GoNextSuggestion`/`GoPrevSuggestion` commands work |
| See predicted instances (yellow, immovable) | Rendered differently | DONE | Predicted instances render in gray (or colored if `colorPredicted`) |
| Double-click predicted instance to convert to user instance | Creates editable copy | DONE | `ConvertPredictionToInstance` command via double-click on node or centroid |
| Move nodes to correct positions | Drag | DONE (for user instances) | Node dragging works |
| Red/green node colors (moved vs unmoved from prediction) | Visual feedback | **MISSING** | P2: No red/green distinction for corrected vs uncorrected nodes |
| Shift+left-click to mark all nodes as complete | Shortcut | **MISSING** | P2: No bulk mark-complete |
| Right-click node to mark as non-visible | Context menu | DONE | ContextMenu has "Mark Node Non-Visible" |
| Sort suggestions by mean score | Column sort | DONE | SuggestionsPanel has Score column and clickable headers for sorting |
| Label 15-20 frames | Iterative workflow | Supported | All labeling primitives work |

**Status**: Core prediction correction workflow is now functional:
- ~~Double-click prediction to convert~~: DONE
- ~~Sort suggestions by score~~: DONE
- **Red/green node colors**: Nice visual feedback -- not implemented

### 5c. Re-training

Same gaps as Tutorial 4 -- no training UI exists.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Predict > Run Training... | Menu | **MISSING** | Same as Tutorial 4 |
| Reset to baseline configuration | Dropdown | **MISSING** | N/A |
| Adjust centroid model settings | Multiple controls | **MISSING** | N/A |
| Adjust centered instance model settings | Multiple controls | **MISSING** | N/A |
| Hit Run | Button | **MISSING** | N/A |
| Stop Early button | Button during training | **MISSING** | N/A |

---

## Tutorial 6: Tracking New Data

### 6a. Open a New Project

**Desktop flow**: File > Open Project > navigate to new_data/new_video.v001.slp.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| File > Open Project | Menu item | DONE | `OpenProjectCommand` works |
| Browse to .slp file | File dialog | DONE | File System Access API picker |
| See new project with video | Video renders | DONE | Works |
| New SLEAP window opens | Multi-window | **MISSING** | Web app is single-window; opening a new project replaces current |

**Gap**: No multi-window support. Opening a new project replaces the current one (with unsaved changes warning if `hasChanges` is true).

### 6b. Run Inference

**Desktop flow**: Predict > Run Inference > configure models > configure tracking > Run.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Predict > Run Inference | Menu | **MISSING** | No Predict menu |
| Select training config file | File browser | **MISSING** | N/A |
| Centroid model config | Tab | **MISSING** | N/A |
| Centered instance model config | Tab | **MISSING** | N/A |
| Inference Pipeline tab | Tab | **MISSING** | N/A |
| Tracker method = simple | Dropdown | **MISSING** | N/A |
| Max tracks = 2 | Number input + checkbox | **MISSING** | N/A |
| Predict On = entire video | Radio/dropdown | **MISSING** | N/A |
| Click Run | Button | **MISSING** | N/A |
| See inference progress | Progress dialog | **MISSING** | N/A |
| See predicted instances on video | Rendering | DONE (if data loaded) | Predicted instances render if present in loaded .slp |
| See seekbar updated with track bars | Seekbar visualization | DONE | Seekbar renders track occupancy bars and labeled frame marks |

**Status**: Same as training -- inference is infeasible in the browser. Need placeholder UI.

---

## Tutorial 7: Proofreading

### 7a. Configure Display for Proofreading

**Desktop flow**: View > Color Predicted Instances, View > Trail Length > 50, Tracks > Seekbar Header > Min Centroid Proximity.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| View > Color Predicted Instances | Toggle | DONE | Checkbox in ViewMenu |
| View > Trail Length > 50 | Submenu with options | DONE | View > Trail Length submenu with 0/10/50/100/250/500 options |
| Tracks > Seekbar Header > Min Centroid Proximity | Submenu | **PARTIAL** | Instance count header graph exists; no centroid proximity metric |

**Status**:
- ~~Trail rendering~~: DONE -- `TrailRenderer.ts` draws colored polylines connecting centroids across frames with opacity fade. Menu control in View > Trail Length.
- **Seekbar header graph**: Instance count bar chart exists, but not the centroid proximity/displacement metrics from SLEAP desktop.

### 7b. Navigate to Track Switch

**Desktop flow**: Go > Go to Frame... > type 1960 > see track switch.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Go > Go to Frame... (Ctrl+J) | Dialog with number input | DONE | `GoToFrameDialog` with shadcn/ui Dialog |
| Type frame number and Enter | Input in dialog | DONE | Input with valid range shown, Enter or "Go" button |
| See track switch visually | Color-coded instances | DONE | Instance colors from palette |
| Navigate frame-by-frame to compare | Arrow keys | DONE | Frame stepping works |

**Status**: Go to Frame dialog is fully functional. Ctrl+J opens the dialog, type frame number, Enter or click "Go".

### 7c. Correct Track Assignment

**Desktop flow**: Click instance > Ctrl+1 to assign track_0, OR Tracks > Set Instance Track > track_0.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Click on instance to select | Canvas click | DONE | Instance selection via node/centroid click |
| Press Ctrl+1 to assign to track_0 | Keyboard shortcut | DONE | Ctrl+1-9 track assignment via `useKeyboardShortcuts` |
| Tracks > Set Instance Track > track_0 | Menu submenu | **PARTIAL** | Context menu has track assignment; Tracks menu has Propagate but no per-track submenu |
| Track correction propagates to future frames | Automatic propagation | DONE | `PropagateTrackLabels` command with multi-frame undo |
| Right-click > Assign Track | Context menu | DONE | ContextMenu has track assignment section |

**Status**: Core proofreading interactions are now functional:
- ~~Ctrl+1-9 track assignment shortcuts~~: DONE
- **Set Instance Track submenu in Tracks menu**: Not yet -- context menu has track assignment, but Tracks menu doesn't have per-track submenu
- ~~Track propagation~~: DONE via `PropagateTrackLabels` command (Tracks menu)
- **Ctrl+hold Tracks Legend**: DONE -- `TracksLegend` component shows overlay when Ctrl held

### 7d. Save New Version

Save As now works -- see section 5a.

---

## Tutorial 8: Exporting the Results

**Desktop flow**: File > Export Analysis HDF5/CSV/NWB.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| File > Export Analysis HDF5... | Menu item opens dialog | **MISSING** | No HDF5 export |
| File > Export Analysis CSV... | Menu item opens dialog | DONE | `ExportCSVCommand` generates CSV with video, frame, track, node data |
| File > Export NWB... | Menu item opens dialog | **MISSING** | No NWB export |
| Export for "Current Video" | Option in export dialog | **MISSING** | No export dialog with video selection |
| Choose output file location | Save dialog | **MISSING** | Would need File System Access API save picker |

**Status**:
- ~~Export CSV~~: DONE -- `ExportCSVCommand` with columns: video_filename, frame_idx, track_name, instance_type, node_name, x, y, score, visible
- **Export HDF5**: Requires h5wasm write support (P2)
- **Export NWB**: Specialized format, hard to implement (P2)
- **Export JSON**: Works via `ExportJsonCommand`
- **Export Labels Package**: DONE -- `ExportPackageCommand` generates `.pkg.json` with labels data and video manifest

---

## Tutorial 9: I'm Done SLEAPing, Now What?

This is informational/reference content. No UI actions needed.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Link to Colab notebooks | External links | **MISSING** | Could add to Help menu |
| Link to integrations | External links | **MISSING** | Could add to Help menu |
| Link to sleap-io docs | External links | DONE | Help > Documentation links to sleap.ai |

**Status**: Help menu now exists with:
- Keyboard Shortcuts... (opens `ShortcutsDialog`)
- Documentation (links to sleap.ai)
- Report Issue (links to GitHub issues)
- About SLEAP Label (opens `HelpDialog`)

---

## Cross-Tutorial Feature Summary

### Features Used Across Multiple Tutorials

| Feature | Tutorials | Web Status | Priority |
|---------|-----------|------------|----------|
| File > Save / Save As | 3, 5, 7 | DONE (SLP format) | -- |
| Suggestion navigation (Space/Shift+Space) | 3, 5 | DONE | -- |
| Right-click > Add Instance | 3, 5 | DONE | -- |
| Node dragging | 3, 5 | DONE | -- |
| Zoom (scroll wheel) | 3, 5, 7 | DONE | -- |
| Track assignment (Ctrl+1-9) | 7 | DONE | -- |
| Go to Frame dialog (Ctrl+J) | 7 | DONE | -- |
| Color Predicted Instances | 5, 7 | DONE | -- |
| Trail Length / Trail rendering | 7 | DONE | -- |
| Double-click prediction to convert | 5 | DONE | -- |
| Training/Inference UI | 4, 5, 6 | DONE (placeholder dialogs) | -- |
| Export formats (CSV, HDF5, NWB) | 8 | CSV=DONE, HDF5/NWB=MISSING | P2 |
| Skeleton configuration | 2 | DONE | -- |
| Generate Suggestions | 3 | DONE (Stride/Random) | -- |
| Alt+drag whole instance | 3, 5 | DONE | -- |
| Alt+scroll rotate instance | 3, 5 | DONE | -- |
| Track propagation | 7 | DONE | -- |
| Ctrl+hold Tracks Legend | 7 | DONE | -- |
| Seekbar track colors | 7 | DONE | -- |
| Help menu | 9 | DONE | -- |

---

## Blockers by Tutorial Completion Level

### Can a user complete each tutorial step in the web app?

| Tutorial | Completable? | Blockers |
|----------|-------------|----------|
| 1. Setup | YES | None (web is zero-install) |
| 2. Importing Data | PARTIAL | Add Videos button is stub; no video import dialog |
| 2. Configure Skeleton | YES | Works (inline rename, templates) |
| 3. Generate Suggestions | YES | Stride and Random methods work |
| 3. Initial Labeling | YES | All core labeling works (Alt+drag, Alt+scroll) |
| 3. Save Project | YES | Saves as .slp via `saveSlpToBytes()` |
| 4. Training a Model | NO | No training UI (infeasible for browser); placeholder dialog exists |
| 5. Save New Version | YES | Save As works for SLP |
| 5. Correcting Predictions | YES | Double-click-to-convert, score sort both work |
| 5. Re-training | NO | Same as Tutorial 4 |
| 6. Open New Project | YES | Works (with unsaved changes warning) |
| 6. Run Inference | NO | No inference UI (infeasible for browser); placeholder dialog exists |
| 7. Configure Proofreading View | YES | Color predicted, trails, seekbar marks all work |
| 7. Navigate to Track Switch | YES | Go to Frame dialog works |
| 7. Correct Track Assignment | YES | Ctrl+1-9, context menu, propagation all work |
| 7. Save New Version | YES | Save As works |
| 8. Export Results | PARTIAL | CSV works; HDF5/NWB missing |
| 9. Next Steps | N/A | Informational only; Help menu has links |

---

## Priority Action Items (Tutorial-Driven) -- Updated 2026-03-04

### Completed (formerly P0/P1)

The following items have been implemented:

1. ~~Save As .slp format~~ -- DONE via `saveSlpToBytes()`
2. ~~Ctrl+1-9 track assignment~~ -- DONE
3. ~~Generate Suggestions~~ -- DONE (Stride/Random)
4. ~~Double-click predicted instance to convert~~ -- DONE
5. ~~Go to Frame dialog~~ -- DONE
6. ~~Save As with file picker~~ -- DONE (SLP and JSON)
7. ~~Export Analysis CSV~~ -- DONE
8. ~~Alt+drag to move entire instance~~ -- DONE
9. ~~Trail rendering + menu control~~ -- DONE
10. ~~Track propagation~~ -- DONE
11. ~~Suggestion score column + sorting~~ -- DONE
12. ~~Unsaved changes warning~~ -- DONE (beforeunload + project open/new)
13. ~~Training/Inference placeholder UI~~ -- DONE
14. ~~Inline node rename~~ -- DONE
15. ~~Node Label Size menu control~~ -- DONE
16. ~~Alt+scroll to rotate instance~~ -- DONE
17. ~~Help menu with documentation links~~ -- DONE
18. ~~Seekbar header graph~~ -- DONE (instance count)
19. ~~Skeleton template loading~~ -- DONE

### Remaining Items

#### P1 -- Needed for full tutorial parity

1. **Add Videos button** (Tutorial 2) -- Wire to file picker (currently stub)
2. **Set Instance Track submenu in Tracks menu** (Tutorial 7) -- Menu-based alternative to Ctrl+1-9

#### P2 -- Nice-to-have

3. **Red/green node coloring** (Tutorial 5) -- Visual feedback for corrected nodes
4. **Cmd+click to duplicate instance** (Tutorial 3) -- Quick duplication
5. **Export HDF5/NWB** (Tutorial 8) -- Advanced export formats
6. **Seekbar header proximity/displacement metrics** (Tutorial 7) -- Beyond instance count
7. **Shift+left-click mark all nodes complete** (Tutorial 5) -- Bulk completion

---

## Implementation Status

All five originally planned phases are now substantially complete:

**Phase 1: Core labeling loop** (Tutorials 2-3) -- DONE
- ~~Generate Suggestions~~ DONE (stride + random)
- ~~Go to Frame dialog~~ DONE
- Add Videos button still a stub (only remaining gap)

**Phase 2: Prediction correction loop** (Tutorial 5) -- DONE
- ~~Double-click predicted instance to convert~~ DONE
- ~~Alt+drag whole instance~~ DONE
- ~~Suggestion score column + sorting~~ DONE

**Phase 3: Proofreading** (Tutorial 7) -- DONE
- ~~Ctrl+1-9 track assignment~~ DONE
- ~~Track propagation~~ DONE
- ~~Trail rendering~~ DONE
- ~~Ctrl+hold Tracks Legend~~ DONE
- Set Instance Track submenu still not in Tracks menu (context menu works)

**Phase 4: Save/Export** (Tutorials 3, 5, 7, 8) -- DONE
- ~~Save / Save As (SLP)~~ DONE
- ~~Export Analysis CSV~~ DONE
- ~~Export Labels Package~~ DONE
- ~~Unsaved changes warning~~ DONE

**Phase 5: Training/Inference placeholders** (Tutorials 4, 5, 6) -- DONE
- ~~Predict menu with placeholder dialogs~~ DONE
- ~~Help menu with links~~ DONE
