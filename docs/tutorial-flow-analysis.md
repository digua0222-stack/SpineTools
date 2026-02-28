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
| Double-click node name to edit inline | Inline edit in table | **PARTIAL** | Dialog-based add with name input; no inline rename after creation |
| Press Enter to save name | Inline edit commit | N/A | Dialog has "Add" button |
| Create 3 nodes (head, torso, tail_base) | Repeat node creation | DONE | Works via repeated dialog use |
| Switch to Edges tab | Tab within Skeleton panel | DONE | Nodes/Edges tabs exist |
| Add edge: torso -> head | Dropdown selectors | DONE | "New Edge" dialog with source/destination selects |
| Add edge: torso -> tail_base | Same | DONE | Same flow |
| See final skeleton structure | Node/edge tables | DONE | Tables show nodes and edges |

**Gaps**:
- **Inline node rename**: Desktop allows double-click to rename in-place; web requires delete + re-add
- **Load skeleton template**: Dropdown exists in SkeletonPanel but `console.log`s only -- not wired to real template data
- Tutorial tip mentions View > Edge Style > Wedge: **DONE** (View menu has edge style radio)
- Tutorial tip mentions View > Node Marker Size > 12: **DONE** (View menu has slider)
- Tutorial tip mentions View > Node Label Size > 18: **PARTIAL** - State exists (`nodeLabelSize`) but no menu control in ViewMenu

---

## Tutorial 3: Initial Labeling

### 3a. Generate Suggestions

**Desktop flow**: Labeling Suggestions tab > set Method=sample, Samples=50 > Generate Suggestions.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Switch to Labeling Suggestions tab | Side panel tab | DONE | `SuggestionsPanel` tab exists |
| Set Method dropdown to "sample" | Dropdown in panel | **MISSING** | No method dropdown; panel only shows existing suggestions |
| Set "Samples Per Video" to 50 | Number input | **MISSING** | No sample count input |
| Click "Generate Suggestions" | Button triggers generation | **STUB** | Button exists but `console.log`s only |
| See populated suggestion list | Table of frame suggestions | DONE | SuggestionsPanel renders suggestion rows when data exists |

**Critical gaps**:
- **Generate Suggestions** is completely unimplemented -- the button is a stub
- No method selection (sample, stride, image features, etc.)
- No sample count input
- The "sample" method (random frame sampling) is trivially implementable in the browser
- The "stride" method (evenly spaced) is also trivial
- Advanced methods (image_features, prediction_score, velocity) require ML -- need placeholder

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
| Pinch-to-zoom | Touch gesture | **MISSING** | P2: No touch gesture support |
| Add second instance (right-click > Default) | Same as first | DONE | Works |
| Drag nodes for second animal | Same as first | DONE | Works |
| Alt+drag to move entire instance | Alt modifier + drag | **MISSING** | P1: No whole-instance drag |
| Alt+scroll to rotate instance | Alt + scroll wheel | **MISSING** | P2: No instance rotation |
| Cmd/Win+click to duplicate instance | Modifier + click | **MISSING** | P2: No click-to-duplicate |

**Gaps**:
- **Alt+drag whole instance**: Tutorial recommends this as a tip -- not implemented
- **Alt+scroll rotate**: Tutorial recommends -- not implemented
- **Cmd+click duplicate**: Tutorial recommends -- not implemented
- These are all P1-P2 quality-of-life features

### 3c. Save the Project

**Desktop flow**: File > Save > dialog > Save button.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| File > Save | Menu item | **PARTIAL** | `SaveProjectCommand` exists but saves as JSON blob download, not .slp |
| Save dialog with path | Native file dialog | **MISSING** | No File System Access API save picker |
| Cmd+S shortcut | Keyboard shortcut | DONE | Shortcut defined and wired |
| File saved as `.slp` | Native SLP format | **MISSING** | Cannot write .slp from browser (sleap-io.js `saveSlp` is Node-only) |

**Critical gap**:
- **Save as .slp is not possible in browser** -- this is a P0 blocker documented in missing-features-audit
- Current save downloads a JSON file, which cannot be re-opened in SLEAP desktop
- Tauri path could enable .slp save via Node.js-compatible backend

---

## Tutorial 4: Training a Model

**Desktop flow**: Predict > Run Training... > configure pipeline > configure centroid model > configure centered instance model > Run.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Predict menu > Run Training... | Opens training dialog | **MISSING** | No Predict menu exists at all |
| Training Pipeline tab | Tab in training dialog | **MISSING** | No training dialog |
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

**What to add**:
- **Placeholder Predict menu** with "Run Training..." and "Run Inference..." items
- These should show an informational dialog explaining that training requires:
  - SLEAP desktop app, OR
  - Command-line `sleap-nn train` / `sleap-nn track`, OR
  - Google Colab notebook
- **Export Labels Package** command to prepare data for training elsewhere
- Link to Colab training notebook

---

## Tutorial 5: Correcting Predictions

### 5a. Save a New Version

**Desktop flow**: File > Save As... > auto-incremented filename > Save.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| File > Save As... | Menu item | **DISABLED** | Menu item exists but is `disabled` |
| Auto-increment version (v001 -> v002) | Auto in dialog | **MISSING** | No version incrementing logic |
| Cmd+Shift+S shortcut | Keyboard shortcut | DEFINED but NO-OP | Shortcut in `shortcuts.ts` but no command wired |

**Gaps**:
- **Save As** is disabled -- needs implementation (at minimum for JSON, ideally for .slp)
- Version auto-increment is a nice-to-have

### 5b. Labeling from Predictions

**Desktop flow**: Navigate suggestions > double-click predicted instance to convert > adjust nodes.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Navigate between suggestions (Space/Shift+Space) | Keyboard shortcuts | DONE | `GoNextSuggestion`/`GoPrevSuggestion` commands work |
| See predicted instances (yellow, immovable) | Rendered differently | DONE | Predicted instances render in gray (or colored if `colorPredicted`) |
| Double-click predicted instance to convert to user instance | Creates editable copy | **MISSING** | P1: No double-click-to-convert handler |
| Move nodes to correct positions | Drag | DONE (for user instances) | Node dragging works |
| Red/green node colors (moved vs unmoved from prediction) | Visual feedback | **MISSING** | P2: No red/green distinction for corrected vs uncorrected nodes |
| Shift+left-click to mark all nodes as complete | Shortcut | **MISSING** | P2: No bulk mark-complete |
| Right-click node to mark as non-visible | Context menu | DONE | ContextMenu has "Mark Node Non-Visible" |
| Sort suggestions by mean score | Column sort | **MISSING** | P1: SuggestionsPanel has no score column or sort |
| Label 15-20 frames | Iterative workflow | Supported | All labeling primitives work |

**Critical gaps**:
- **Double-click prediction to convert**: This is the core human-in-the-loop workflow -- not implemented
- **Sort suggestions by score**: Important for efficient labeling -- not in panel
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

**Gap**: No multi-window support. Opening a new project replaces the current one without warning if unsaved changes exist.

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
| View > Trail Length > 50 | Submenu with options | **MISSING** | State exists (`trailLength`) but no menu control and no trail rendering |
| Tracks > Seekbar Header > Min Centroid Proximity | Submenu | **MISSING** | No seekbar header graph at all |

**Gaps**:
- **Trail rendering**: State exists but no canvas trail drawing or menu control (P1)
- **Seekbar header graph**: Complex feature showing proximity/displacement metrics (P2)

### 7b. Navigate to Track Switch

**Desktop flow**: Go > Go to Frame... > type 1960 > see track switch.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Go > Go to Frame... (Ctrl+J) | Dialog with number input | **MISSING** | Shortcut defined (`goto frame: $mod+KeyJ`) but no dialog |
| Type frame number and Enter | Input in dialog | **MISSING** | No dialog exists |
| See track switch visually | Color-coded instances | DONE | Instance colors from palette |
| Navigate frame-by-frame to compare | Arrow keys | DONE | Frame stepping works |

**Critical gap**:
- **Go to Frame dialog**: Shortcut is defined but no command is wired to it. This is a basic navigation feature (P1).

### 7c. Correct Track Assignment

**Desktop flow**: Click instance > Ctrl+1 to assign track_0, OR Tracks > Set Instance Track > track_0.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Click on instance to select | Canvas click | DONE | Instance selection via node/centroid click |
| Press Ctrl+1 to assign to track_0 | Keyboard shortcut | **MISSING** | P0: No Ctrl+digit shortcuts for track assignment |
| Tracks > Set Instance Track > track_0 | Menu submenu | **MISSING** | P0: No "Set Instance Track" submenu in TracksMenu |
| Track correction propagates to future frames | Automatic propagation | **MISSING** | P1: No track propagation logic |
| Right-click > Assign Track | Context menu | DONE | ContextMenu has track assignment section |

**Critical gaps**:
- **Ctrl+1-9 track assignment shortcuts**: This is THE core proofreading interaction -- P0
- **Set Instance Track submenu in Tracks menu**: Desktop has a dynamic submenu listing all tracks
- **Track propagation to future frames**: When you reassign a track, SLEAP desktop propagates the change to all subsequent frames with the same track. This is not implemented.

### 7d. Save New Version

Same gaps as 5a -- Save As is disabled.

---

## Tutorial 8: Exporting the Results

**Desktop flow**: File > Export Analysis HDF5/CSV/NWB.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| File > Export Analysis HDF5... | Menu item opens dialog | **MISSING** | No HDF5 export |
| File > Export Analysis CSV... | Menu item opens dialog | **DISABLED** | Menu item exists but is disabled (`disabled` prop) |
| File > Export NWB... | Menu item opens dialog | **MISSING** | No NWB export |
| Export for "Current Video" | Option in export dialog | **MISSING** | No export dialog with video selection |
| Choose output file location | Save dialog | **MISSING** | Would need File System Access API save picker |

**Gaps**:
- **Export CSV**: Menu item exists but is disabled -- needs implementation (P1, feasible)
- **Export HDF5**: Requires h5wasm write support (P2)
- **Export NWB**: Specialized format, hard to implement (P2)
- **Export JSON**: Currently works via `ExportJsonCommand` -- this is functional but not a standard SLEAP export format

---

## Tutorial 9: I'm Done SLEAPing, Now What?

This is informational/reference content. No UI actions needed.

| Tutorial Action | Desktop | Web Status | Gap |
|----------------|---------|------------|-----|
| Link to Colab notebooks | External links | **MISSING** | Could add Help menu with links |
| Link to integrations | External links | **MISSING** | Help menu |
| Link to sleap-io docs | External links | **MISSING** | Help menu |

**Gap**: No Help menu exists in the web app.

---

## Cross-Tutorial Feature Summary

### Features Used Across Multiple Tutorials

| Feature | Tutorials | Web Status | Priority |
|---------|-----------|------------|----------|
| File > Save / Save As | 3, 5, 7 | Save=PARTIAL (JSON only), Save As=DISABLED | P0 |
| Suggestion navigation (Space/Shift+Space) | 3, 5 | DONE | -- |
| Right-click > Add Instance | 3, 5 | DONE | -- |
| Node dragging | 3, 5 | DONE | -- |
| Zoom (scroll wheel) | 3, 5, 7 | DONE | -- |
| Track assignment (Ctrl+1-9) | 7 | MISSING | P0 |
| Go to Frame dialog (Ctrl+J) | 7 | MISSING | P1 |
| Color Predicted Instances | 5, 7 | DONE | -- |
| Trail Length / Trail rendering | 7 | MISSING | P1 |
| Double-click prediction to convert | 5 | MISSING | P1 |
| Training/Inference UI | 4, 5, 6 | MISSING | Placeholder needed |
| Export formats (CSV, HDF5, NWB) | 8 | MISSING/DISABLED | P1-P2 |
| Skeleton configuration | 2 | DONE | -- |
| Generate Suggestions | 3 | STUB | P1 |
| Alt+drag whole instance | 3, 5 | MISSING | P1 |

---

## Blockers by Tutorial Completion Level

### Can a user complete each tutorial step in the web app?

| Tutorial | Completable? | Blockers |
|----------|-------------|----------|
| 1. Setup | YES | None (web is zero-install) |
| 2. Importing Data | PARTIAL | Add Videos button is stub; no video import dialog |
| 2. Configure Skeleton | YES | Works (minor: no inline rename) |
| 3. Generate Suggestions | NO | Generate Suggestions button is stub |
| 3. Initial Labeling | YES | All core labeling works (minor: no Alt+drag) |
| 3. Save Project | PARTIAL | Saves as JSON only, not .slp |
| 4. Training a Model | NO | No training UI (infeasible for browser) |
| 5. Save New Version | NO | Save As is disabled |
| 5. Correcting Predictions | PARTIAL | No double-click-to-convert; no score sort |
| 5. Re-training | NO | Same as Tutorial 4 |
| 6. Open New Project | YES | Works (no unsaved changes warning) |
| 6. Run Inference | NO | No inference UI (infeasible for browser) |
| 7. Configure Proofreading View | PARTIAL | Color predicted=YES, trails=NO, seekbar header=NO |
| 7. Navigate to Track Switch | PARTIAL | No Go to Frame dialog |
| 7. Correct Track Assignment | PARTIAL | No Ctrl+1-9; context menu track assignment works |
| 7. Save New Version | NO | Save As disabled |
| 8. Export Results | PARTIAL | Only JSON export works; CSV/HDF5/NWB missing |
| 9. Next Steps | N/A | Informational only |

---

## Priority Action Items (Tutorial-Driven)

### P0 -- Required for core tutorial workflows

1. **Save As .slp format** (Tutorials 3, 5, 7) -- Blocked on sleap-io.js browser save
2. **Ctrl+1-9 track assignment** (Tutorial 7) -- Core proofreading interaction
3. **Set Instance Track submenu in Tracks menu** (Tutorial 7) -- Menu-based alternative

### P1 -- Needed for tutorial completeness

4. **Generate Suggestions (sample method)** (Tutorial 3) -- Random frame sampling is trivially implementable
5. **Double-click predicted instance to convert** (Tutorial 5) -- Core prediction correction workflow
6. **Go to Frame dialog** (Tutorial 7) -- Basic navigation, shortcut already defined
7. **Add Videos button** (Tutorial 2) -- Wire to file picker
8. **Save As (at least JSON with file picker)** (Tutorials 5, 7) -- Enable versioned saves
9. **Export Analysis CSV** (Tutorial 8) -- Enable data export
10. **Alt+drag to move entire instance** (Tutorial 3) -- Important labeling efficiency
11. **Trail rendering + menu control** (Tutorial 7) -- Needed for proofreading
12. **Track propagation** (Tutorial 7) -- Track changes should propagate forward
13. **Suggestion score column + sorting** (Tutorial 5) -- Efficient labeling guidance
14. **Unsaved changes warning** (Tutorial 6) -- Prevent data loss when opening new project

### P2 -- Nice-to-have for full tutorial parity

15. **Training/Inference placeholder UI** (Tutorials 4, 5, 6) -- Info dialogs with alternatives
16. **Inline node rename** (Tutorial 2) -- Double-click to rename in skeleton table
17. **Node Label Size menu control** (Tutorial 3) -- State exists, needs menu item
18. **Red/green node coloring** (Tutorial 5) -- Visual feedback for corrected nodes
19. **Alt+scroll to rotate instance** (Tutorial 3) -- Advanced manipulation
20. **Cmd+click to duplicate instance** (Tutorial 3) -- Quick duplication
21. **Export HDF5/NWB** (Tutorial 8) -- Advanced export formats
22. **Help menu with documentation links** (Tutorial 9) -- Reference links
23. **Seekbar header graph** (Tutorial 7) -- Proximity/displacement visualization
24. **Skeleton template loading** (Tutorial 2) -- Wire dropdown to real templates
25. **Shift+left-click mark all nodes complete** (Tutorial 5) -- Bulk completion

---

## Recommended Implementation Order

For users to be able to follow the basic tutorial flow in the web app:

**Phase 1: Core labeling loop** (Tutorials 2-3)
- Wire Add Videos button to file picker
- Implement Generate Suggestions (sample + stride methods)
- Implement Go to Frame dialog (Ctrl+J)

**Phase 2: Prediction correction loop** (Tutorial 5)
- Double-click predicted instance to convert
- Alt+drag whole instance
- Suggestion score column + sorting

**Phase 3: Proofreading** (Tutorial 7)
- Ctrl+1-9 track assignment shortcuts
- Set Instance Track submenu in Tracks menu
- Track propagation to future frames
- Trail rendering

**Phase 4: Save/Export** (Tutorials 3, 5, 7, 8)
- Save As with file picker (JSON initially)
- Export Analysis CSV
- Unsaved changes warning on close/new project

**Phase 5: Training/Inference placeholders** (Tutorials 4, 5, 6)
- Predict menu with placeholder dialogs
- Export Labels Package for external training
- Links to Colab notebooks and CLI instructions
