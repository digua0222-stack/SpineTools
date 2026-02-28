# SLEAP GUI Feature Inventory

Comprehensive analysis of the SLEAP Qt desktop GUI (`sleap/gui/`). This document captures every feature, menu item, command, panel, dialog, overlay, shortcut, and state variable.

Source files analyzed:
- `sleap/gui/app.py` (1994 lines) - MainWindow, menus, dock creation, overlays
- `sleap/gui/commands.py` (4635 lines) - ~80+ command classes
- `sleap/gui/state.py` - GuiState class
- `sleap/gui/shortcuts.py` - Keyboard shortcuts
- `sleap/gui/color.py` - ColorManager
- `sleap/gui/widgets/` - Video player, docks, slider, views
- `sleap/gui/dialogs/` - All dialog classes
- `sleap/gui/overlays/` - Instance, tracks, confmaps, pafs
- `sleap/gui/learning/dialog.py` - Training/inference dialog
- `sleap/prefs.py` - Preferences system

---

## 1. Complete Menu Structure

### File Menu
| Menu Item | Shortcut | Command Class | Description |
|-----------|----------|---------------|-------------|
| New Project | Ctrl+N | `NewProject` | Opens a new empty project window |
| Open Project... | Ctrl+O | `OpenProject` | Opens .slp file browser |
| **Import...** (submenu) | | | |
| -- COCO dataset... | | `ImportCoco` | Import COCO JSON + images |
| -- DeepLabCut dataset... | | `ImportDeepLabCut` | Import DLC .yaml/.csv |
| -- Multiple DeepLabCut datasets from folder... | | `ImportDeepLabCutFolder` | Batch DLC import |
| -- NWB dataset... | | `ImportNWB` | Import NWB files |
| -- SLEAP Analysis HDF5... | | `ImportAnalysisFile` | Import analysis .h5 |
| Merge into Project... | | `MergeProject` | Merge another .slp into current |
| --- separator --- | | | |
| Add Videos... | | `AddVideo` | Add video files to project |
| Replace Videos... | | `ReplaceVideo` | Replace video file paths |
| --- separator --- | | | |
| Save | Ctrl+S | `SaveProject` | Save current project |
| Save As... | Ctrl+Shift+S | `SaveProjectAs` | Save to new file |
| **Export Analysis HDF5...** (submenu) | | | |
| -- Current Video... | Ctrl+Alt+E | `ExportAnalysisFile` | Export analysis for current video |
| -- All Videos... | | `ExportAnalysisFile(all_videos=True)` | Export analysis for all videos |
| **Export Analysis CSV...** (submenu) | | | |
| -- Current Video... | | `ExportAnalysisFile(csv=True)` | Export CSV for current video |
| -- All Videos... | | `ExportAnalysisFile(csv=True, all_videos=True)` | Export CSV for all videos |
| Export NWB... | | `SaveProjectAs(adaptor="nwb")` | Export as NWB format |
| --- separator --- | | | |
| Reset preferences to defaults... | | `resetPrefs()` | Reset all prefs |
| Open Preferences Directory... | | `openPrefs()` | Open prefs folder in file manager |
| --- separator --- | | | |
| Quit | Ctrl+Q | `close()` | Close application |

### Go Menu
| Menu Item | Shortcut | Command Class | Description |
|-----------|----------|---------------|-------------|
| Next Labeled Frame | Alt+Right | `GoNextLabeledFrame` | Jump to next frame with labels |
| Previous Labeled Frame | Alt+Left | `GoPreviousLabeledFrame` | Jump to prev frame with labels |
| Last Interacted Frame | Ctrl+A | `GoLastInteractedFrame` | Jump to last edited frame |
| Next User Labeled Frame | Ctrl+U | `GoNextUserLabeledFrame` | Next frame with user instances |
| Next Suggestion | Space | `GoNextSuggestedFrame` | Next suggested frame (or QC flag) |
| Previous Suggestion | Shift+Space | `GoPrevSuggestedFrame` | Prev suggested frame (or QC flag) |
| Next Track Spawn Frame | Ctrl+E | `GoNextTrackFrame` | Next frame where a track begins |
| --- separator --- | | | |
| Next Video | Alt+Shift+Right | state increment | Switch to next video |
| Previous Video | Alt+Shift+Left | state increment | Switch to prev video |
| --- separator --- | | | |
| Go to Frame... | Ctrl+J | `GoFrameGui` | Input dialog for frame number |
| Select to Frame... | Ctrl+Shift+J | `SelectToFrameGui` | Select range from current to given frame |
| --- separator --- | | | |
| Select Next Instance | ` (backtick) | state increment | Cycle through instances |
| Clear Selection | Esc | state set None | Deselect current instance |

### View Menu
| Menu Item | Shortcut | Type | Description |
|-----------|----------|------|-------------|
| *Dock toggles* | | auto-added | Toggle visibility of each dock panel |
| --- separator --- | | | |
| Fit View to Instances | Ctrl+= | checkbox | Auto-zoom to fit all instances |
| Fit View to Selection | | checkbox | Auto-zoom to selected instance |
| --- separator --- | | | |
| Color Predicted Instances | | checkbox | Toggle coloring of predictions |
| **Color Palette** (submenu) | | choices | Select palette (standard, 5+, alphabet, etc.) |
| **Apply Distinct Colors To** (submenu) | | choices | "instances", "nodes", "edges" |
| --- separator --- | | | |
| Show Instances | H | checkbox | Toggle instance visibility |
| Show Non-Visible Nodes | | checkbox | Show nodes marked non-visible |
| Show Node Names | Ctrl+Tab | checkbox | Toggle node name labels |
| Show Edges | Ctrl+Shift+Tab | checkbox | Toggle edge lines |
| **Edge Style** (submenu) | | choices | "Line" or "Wedge" |
| **Node Marker Size** (submenu) | | choices | 1, 2, 3, 4, 6, 8, 12 |
| **Node Label Size** (submenu) | | choices | 6, 9, 12, 18, 24, 36 |
| --- separator --- | | | |
| **Trail Length** (submenu) | | choices | 0, 10, 50, 100, 250, 500 |
| **Trail Shade** (submenu) | | choices | "Dark", "Normal", "Light" |
| --- separator --- | | | |
| Render Video Clip with Instances... | | `ExportLabeledClip` | Export annotated video |

### Labels Menu
| Menu Item | Shortcut | Command Class | Description |
|-----------|----------|---------------|-------------|
| Add Instance | Ctrl+I | `AddInstance` | Add new instance to frame |
| **Instance Placement Method** (submenu) | | choices | Best, Average Instance, Force Directed, Random, Copy prior frame, Copy predictions |
| Delete Instance | Ctrl+Backspace | `DeleteSelectedInstance` | Delete selected instance |
| Custom Instance Delete... | | `DeleteDialogCommand` | Delete dialog with filters |
| --- separator --- | | | |
| Extract Clip and Labels... | | `ExportLabelsSubset(as_package=False)` | Export frame range + labels |
| Extract Clip Labels Package... | | `ExportLabelsSubset(as_package=True)` | Export as package |
| --- separator --- | | | |
| Add Instances from All Predictions on Current Frame | | `AddUserInstancesFromPredictions` | Convert all unused predictions to user instances |
| --- separator --- | | | |
| Copy Instance | Ctrl+C | `CopyInstance` | Copy instance to clipboard |
| Paste Instance | Ctrl+V | `PasteInstance` | Paste instance from clipboard |
| --- separator --- | | | |
| Delete Predictions on Current Frame | | `DeleteFramePredictions` | Delete predictions on current frame |
| Delete All Predictions... | | `DeleteAllPredictions` | Delete all predictions in project |
| Delete Predictions from Clip... | | `DeleteClipPredictions` | Delete predictions in selected range |
| Delete Predictions from Area... | | `DeleteAreaPredictions` | Draw rect to delete predictions |
| Delete Predictions with Low Score... | | `DeleteLowScorePredictions` | Score threshold dialog |
| Delete Predictions beyond Max Instances... | | `DeleteInstanceLimitPredictions` | Instance count limit dialog |
| Delete Predictions beyond Frame Limit... | | `DeleteFrameLimitPredictions` | Frame range dialog |
| Delete Predictions on User-Labeled Frames... | | `DeleteUserFramePredictions` | Clean up overlapping predictions |

### Analyze Menu
| Menu Item | Command | Description |
|-----------|---------|-------------|
| Instance Size Distribution... | `_open_size_distribution()` | Distribution analysis dialog |
| Label QC... | `_open_label_qc()` | Quality control dock widget |

### Tracks Menu
| Menu Item | Shortcut | Command Class | Description |
|-----------|----------|---------------|-------------|
| **Set Instance Track** (submenu) | Ctrl+1..9 | `SetSelectedInstanceTrack` | Assign track to instance |
| -- New Track | Ctrl+0 | `AddTrack` | Create new track |
| Propagate Track Labels | | checkbox | Apply track changes to subsequent frames |
| Transpose Instance Tracks | Ctrl+T | `TransposeInstances` | Swap tracks of two instances |
| --- separator --- | | | |
| Delete Instance and Track | Ctrl+Shift+Backspace | `DeleteSelectedInstanceTrack` | Delete instance + entire track |
| **Delete Track** (submenu) | | `DeleteTrack` | Delete specific track |
| **Delete Multiple Tracks** (submenu) | | | |
| -- Unused | | `DeleteMultipleTracks(delete_all=False)` | Delete unused tracks |
| -- All | | `DeleteMultipleTracks(delete_all=True)` | Delete all tracks |
| --- separator --- | | | |
| Copy Instance Track | Ctrl+Shift+C | `CopyInstanceTrack` | Copy track to clipboard |
| Paste Instance Track | Ctrl+Shift+V | `PasteInstanceTrack` | Paste track from clipboard |
| --- separator --- | | | |
| **Seekbar Header** (submenu) | | choices | None, Point Displacement (sum/max), Primary Point Displacement (sum/max), Tracking Score (mean/min), Instance Score (sum/min), Point Score (sum/min), Number of predicted points, Min Centroid Proximity |

### Predict Menu
| Menu Item | Shortcut | Description |
|-----------|----------|-------------|
| Run Training... | Ctrl+L | Open training dialog |
| Run Inference... | | Open inference dialog |
| --- separator --- | | | |
| Evaluation Metrics for Trained Models... | | Show metrics table dialog |
| --- separator --- | | |
| **Export Labels Package...** (submenu) | | |
| -- Labeled frames | | `ExportUserLabelsPackage` - User labels only |
| -- Labeled + suggested frames (recommended) | | `ExportTrainingPackage` - For HITL training |
| -- Labeled + predicted + suggested frames | | `ExportFullPackage` - Everything |
| --- separator --- | | |
| Train on Google Colab... | | Opens Colab notebook URL |

### Help Menu
| Menu Item | Description |
|-----------|-------------|
| Documentation | Opens https://sleap.ai |
| GitHub | Opens GitHub repo |
| Releases | Opens GitHub releases |
| --- separator --- | |
| Check for Updates... | Update checker dialog |
| --- separator --- | |
| **Improve SLEAP** (submenu) | |
| -- Share usage data | Checkbox for analytics |
| -- What is usage data? | Opens docs URL |
| --- separator --- | |
| Keyboard Shortcuts | Opens shortcut editor dialog |
| Debug mode | Checkbox for debug logging |

---

## 2. Dock Panels

### VideosDock
- **Purpose**: Display and manage videos in the project
- **Table**: `VideosTableModel` - lists all videos with filenames, frame counts
- **Features**: Multiple selection, ellipsis-left (truncate path from left), row activation
- **Buttons**: Toggle Grayscale, Show Video, Add Videos, Remove Video
- **State**: `selected_video`, `selected_batch_video`

### SkeletonDock
- **Purpose**: Edit skeleton structure (nodes, edges) and load templates
- **Sections**:
  - **Templates** (collapsible): Dropdown of built-in skeletons, Load button, preview image + description
  - **Project Skeleton**: Two tabs (Nodes, Edges)
    - Nodes tab: Table of node names/symmetry, New Node + Delete Node buttons
    - Edges tab: Table of edges, Source/Destination dropdowns, Add Edge + Delete Edge buttons
  - Load From File... / Save As... buttons

### SuggestionsDock ("Labeling Suggestions")
- **Purpose**: Manage frame suggestions for labeling
- **Table**: `SuggestionsTableModel` - sortable list of suggested frames
- **Nav buttons**: Previous / Next (with labeled count label between)
- **Edit buttons**: Add current frame, Remove, Clear all
- **Form**: `YamlFormWidget` "suggestions" form for generating suggestions
  - Methods: sample, image_features, prediction_score, velocity, frame_chunk, max_point_displacement
  - Target: current video / all videos
  - Per-video count, sampling method (random/stride), node selection

### InstancesDock
- **Purpose**: Display instances on current frame
- **Table**: `LabeledFrameTableModel` - shows instances with track/type info
- **Buttons**: New Instance, Delete Instance

### QC Dock (hidden by default)
- **Purpose**: Label quality control - flag problematic labels
- **Created at init**: `QCDockWidget`
- **Toggled via**: View menu or Analyze > Label QC...
- **Features**: Navigate to flagged frames, integrates with Next/Prev Suggestion navigation

---

## 3. Overlays

### InstanceOverlay (`overlays/instance.py`)
- **Purpose**: Draw skeleton instances on video frame
- **Data source**: `Labels.find()` for current video + frame
- **Draws**: Nodes, edges, labels for each instance via `player.addInstance()`
- **Respects state**: `show instances`, `show labels`, `show edges`, `show non-visible nodes`, `marker size`, `node label size`
- **Prediction highlight**: Highlights predictions "not in training data" when frame has both user and predicted instances

### TrackTrailOverlay (`overlays/tracks.py`)
- **Purpose**: Draw track trails (motion paths) behind instances
- **Attributes**: `trail_length`, `trail_shade` (Dark/Normal/Light)
- **Drawing**: QPainterPath lines per track, with segments at decreasing line width for fade effect
- **Trail options**: Length 0-500 frames, shade multiplier (0.6, 1.0, 1.25), configurable `trail_width` and `trail_node_count`

### TrackListOverlay (`overlays/tracks.py`)
- **Purpose**: Show track list with colors when Ctrl is held + instance selected
- **Drawing**: HTML text box with colored track names, semi-transparent overlay
- **Visibility**: Controlled by `control_key_down and has_selected_instance`

### ConfMapsPlot (`overlays/confmaps.py`)
- **Purpose**: Display confidence map heatmaps (not currently used in main GUI)
- **Drawing**: Per-channel colored QGraphicsPixmapItems

### MultiQuiverPlot (`overlays/pafs.py`)
- **Purpose**: Display part affinity field vectors (not currently used in main GUI)
- **Drawing**: Arrow/quiver plots per channel

---

## 4. Keyboard Shortcuts (Default)

| Action | Default Shortcut |
|--------|-----------------|
| New Project | Ctrl+N |
| Open Project | Ctrl+O |
| Save | Ctrl+S |
| Save As | Ctrl+Shift+S |
| Quit | Ctrl+Q |
| Add Videos | (none) |
| Next Video | Alt+Shift+Right |
| Previous Video | Alt+Shift+Left |
| Go to Frame | Ctrl+J |
| Select to Frame | Ctrl+Shift+J |
| Add Instance | Ctrl+I |
| Delete Instance | Ctrl+Backspace |
| Delete Instance and Track | Ctrl+Shift+Backspace |
| Transpose Tracks | Ctrl+T |
| Select Next Instance | ` (backtick) |
| Clear Selection | Esc |
| Next Labeled Frame | Alt+Right |
| Previous Labeled Frame | Alt+Left |
| Last Interacted Frame | Ctrl+A |
| Next User Labeled Frame | Ctrl+U |
| Next Suggestion | Space |
| Previous Suggestion | Shift+Space |
| Next Track Spawn | Ctrl+E |
| Show Instances | H |
| Show Node Names | Ctrl+Tab |
| Show Edges | Ctrl+Shift+Tab |
| Show Trails | (none) |
| Color Predicted | (none) |
| Fit View | Ctrl+= |
| Run Training | Ctrl+L |
| Export Clip | (none) |
| Delete Frame Predictions | (none - via menu) |
| Delete Clip Predictions | (none - via menu) |
| Delete Area Predictions | (none - via menu) |
| Frame Next | Right |
| Frame Previous | Left |
| Frame Next (medium step) | Ctrl+Right |
| Frame Previous (medium step) | Ctrl+Left |
| Frame Next (large step) | Ctrl+Alt+Right |
| Frame Previous (large step) | Ctrl+Alt+Left |
| Export Analysis (current) | Ctrl+Alt+E |
| Copy Instance | Ctrl+C |
| Paste Instance | Ctrl+V |
| Copy Instance Track | Ctrl+Shift+C |
| Paste Instance Track | Ctrl+Shift+V |
| Set Track 1-9 | Ctrl+1 through Ctrl+9 |
| New Track | Ctrl+0 |

**Note**: Shift + frame navigation shortcuts enable seekbar selection (e.g., Shift+Right extends selection).

Shortcuts are stored in `~/.sleap/shortcuts.yaml` and editable via Help > Keyboard Shortcuts dialog.

---

## 5. Command Classes

All commands inherit from `AppCommand`. `EditCommand` extends `AppCommand` with `does_edits = True`. Each command has `topics` (list of `UpdateTopic` enums) that trigger GUI updates.

### UpdateTopic Enum
| Value | Meaning |
|-------|---------|
| `all` | Update everything |
| `video` | Video list changed |
| `skeleton` | Skeleton structure changed |
| `labels` | Labels data changed |
| `on_frame` | Current frame changed |
| `suggestions` | Suggestions list changed |
| `tracks` | Track data changed |
| `frame` | Frame content changed |
| `project` | Project loaded/changed |
| `project_instances` | Instance data changed |

### File Commands
| Class | Topics | Description |
|-------|--------|-------------|
| `NewProject` | - | Create new project window |
| `LoadLabelsObject` | project, all | Load Labels into GUI |
| `LoadProjectFile` | (inherits) | Load from .slp file |
| `OpenProject` | - | Open project (new window or current) |
| `ImportNWB` | - | Import NWB file |
| `ImportCoco` | - | Import COCO JSON |
| `ImportDeepLabCut` | - | Import DLC dataset |
| `ImportDeepLabCutFolder` | - | Batch DLC import from folder |
| `ImportAnalysisFile` | - | Import analysis HDF5 |
| `SaveProject` | - | Save to current filename |
| `SaveProjectAs` | - | Save with file browser |
| `ExportAnalysisFile` | - | Export .h5 or .csv analysis |
| `ExportVideoClip` | - | Export plain video clip |
| `ExportLabeledClip` | - | Export video with skeleton overlay (uses sleap-io render_video) |
| `ExportDatasetWithImages` | - | Base class for package export |
| `ExportUserLabelsPackage` | - | Export user-labeled frames as package |
| `ExportTrainingPackage` | - | Export labels + suggestions as package |
| `ExportFullPackage` | - | Export everything as package |
| `ExportLabelsSubset` | - | Export clip range + labels (subsets video) |

### Navigation Commands
| Class | Topics | Description |
|-------|--------|-------------|
| `GoIteratorCommand` | - | Base for iterator-based navigation |
| `GoPreviousLabeledFrame` | - | Previous frame with any label |
| `GoNextLabeledFrame` | - | Next frame with any label |
| `GoNextUserLabeledFrame` | - | Next frame with user instances |
| `GoLastInteractedFrame` | - | Last frame user edited |
| `GoNextSuggestedFrame` | - | Next suggestion (direction=1) |
| `GoPrevSuggestedFrame` | - | Previous suggestion (direction=-1) |
| `GoNextTrackFrame` | - | Next frame where a new track starts |
| `GoFrameGui` | - | Go to specific frame number (dialog) |
| `SelectToFrameGui` | - | Select seekbar range to frame |
| `NavCommand` | - | Base for direct navigation |

### Editing Commands - Video/Skeleton
| Class | Topics | Description |
|-------|--------|-------------|
| `ToggleGrayscale` | video, frame | Toggle grayscale for all videos |
| `AddVideo` | video | Add videos via import dialog |
| `ShowImportVideos` | video | Import videos from given filenames |
| `ReplaceVideo` | video, frame | Replace video paths |
| `RemoveVideo` | video, suggestions, frame | Remove video from project |
| `OpenSkeleton` | skeleton | Load skeleton from file or template |
| `SaveSkeleton` | - | Save skeleton to JSON |
| `NewNode` | skeleton | Add "new_part" node |
| `DeleteNode` | skeleton | Remove selected node |
| `SetNodeName` | skeleton | Rename node |
| `SetNodeSymmetry` | skeleton | Set/clear node symmetry |
| `NewEdge` | skeleton | Add edge between nodes |
| `DeleteEdge` | skeleton | Remove selected edge |

### Editing Commands - Instances
| Class | Topics | Description |
|-------|--------|-------------|
| `AddInstance` | frame, project_instances, suggestions | Create new instance with placement method |
| `SetInstancePointLocations` | (none) | Update node positions (no redraw) |
| `SetInstancePointVisibility` | (none) | Toggle node visibility (no redraw) |
| `AddMissingInstanceNodes` | frame | Fill in missing nodes (template/random/force-directed) |
| `AddUserInstancesFromPredictions` | frame, project_instances | Convert all unused predictions |
| `CopyInstance` | - | Copy to clipboard |
| `PasteInstance` | frame, project_instances | Paste from clipboard |
| `DeleteSelectedInstance` | frame, project_instances, suggestions | Delete current instance |
| `DeleteSelectedInstanceTrack` | project_instances, tracks, suggestions | Delete instance + all in track |
| `DeleteDialogCommand` | project_instances | Custom delete with dialog |

### Editing Commands - Predictions Deletion
| Class | Topics | Description |
|-------|--------|-------------|
| `InstanceDeleteCommand` | project_instances | Base class for batch deletion |
| `DeleteAllPredictions` | (inherits) | Delete all predictions (uses `labels.remove_predictions()`) |
| `DeleteFramePredictions` | (inherits) | Delete predictions on current frame (no confirmation) |
| `DeleteClipPredictions` | (inherits) | Delete predictions in selected clip range |
| `DeleteAreaPredictions` | (inherits) | Delete predictions in drawn rectangle (all frames) |
| `DeleteLowScorePredictions` | (inherits) | Delete predictions below score threshold |
| `DeleteInstanceLimitPredictions` | (inherits) | Delete lowest-score predictions beyond N per frame |
| `DeleteFrameLimitPredictions` | (inherits) | Delete all instances outside frame range |
| `DeleteUserFramePredictions` | (inherits) | Delete predictions on user-labeled frames |

### Track Commands
| Class | Topics | Description |
|-------|--------|-------------|
| `AddTrack` | tracks | Create new track with next number |
| `SetSelectedInstanceTrack` | tracks | Assign track (with propagation support) |
| `DeleteTrack` | tracks | Remove specific track |
| `DeleteMultipleTracks` | tracks | Remove unused or all tracks |
| `CopyInstanceTrack` | - | Copy track to clipboard |
| `PasteInstanceTrack` | tracks | Paste track from clipboard |
| `SetTrackName` | tracks, frame | Rename track |
| `TransposeInstances` | project_instances, tracks | Swap tracks of two instances |

### Suggestion Commands
| Class | Topics | Description |
|-------|--------|-------------|
| `GenerateSuggestions` | suggestions | Generate suggestions with selected method |
| `AddSuggestion` | suggestions | Add current frame as suggestion |
| `RemoveSuggestion` | suggestions | Remove selected suggestion |
| `ClearSuggestions` | suggestions | Clear all suggestions (with confirmation) |

### Other Commands
| Class | Topics | Description |
|-------|--------|-------------|
| `MergeProject` | all | Merge another .slp file into current |
| `OpenWebsite` | - | Open URL in system browser |

---

## 6. State Variables

All stored in `GuiState` (a dict-like object with callback support).

| Key | Type | Purpose |
|-----|------|---------|
| `labels` | `Labels` | The main dataset object |
| `filename` | `str \| None` | Path to current .slp file |
| `skeleton` | `Skeleton` | Current skeleton |
| `video` | `Video \| None` | Currently active video |
| `frame_idx` | `int` | Current frame index |
| `frame_range` | `(int, int)` | Selected frame range (start, end) |
| `has_frame_range` | `bool` | Whether a range is selected |
| `labeled_frame` | `LabeledFrame \| None` | Current LabeledFrame object |
| `last_interacted_frame` | `LabeledFrame \| None` | Last frame user edited |
| `instance` | `Instance \| None` | Currently selected instance |
| `selected_node` | `Node \| None` | Selected node in skeleton table |
| `selected_edge` | `dict \| None` | Selected edge in skeleton table |
| `selected_video` | `Video \| None` | Selected video in videos table |
| `selected_batch_video` | `list` | Multi-selected video indices |
| `suggestion_idx` | `int` | Index of current suggestion |
| `project_loaded` | `bool` | Whether a project is loaded |
| `has_changes` | `bool` | Whether unsaved changes exist |
| `show instances` | `bool` | Toggle instance drawing |
| `show labels` | `bool` | Toggle node name labels |
| `show edges` | `bool` | Toggle edge lines |
| `show non-visible nodes` | `bool` | Show nodes marked non-visible |
| `edge style` | `str` | "Line" or "Wedge" |
| `fit` | `bool` | Auto-zoom to fit instances |
| `fit_selection` | `bool` | Auto-zoom to selected instance |
| `color predicted` | `bool` | Use colors for predictions |
| `palette` | `str` | Color palette name |
| `distinctly_color` | `str` | "instances", "nodes", or "edges" |
| `trail_length` | `int` | Track trail length in frames |
| `trail_shade` | `str` | "Dark", "Normal", "Light" |
| `marker size` | `int` | Node marker radius |
| `node label size` | `int` | Font size for node labels |
| `propagate track labels` | `bool` | Apply track changes to subsequent frames |
| `instance_init_method` | `str` | Default instance placement method |
| `seekbar_header` | `str` | Which metric to show in seekbar header |
| `share usage data` | `bool` | Analytics opt-in |
| `debug mode` | `bool` | Enable debug logging |
| `skeleton_preview_image` | `bytes \| None` | Template skeleton preview |
| `skeleton_description` | `str` | Template skeleton description |
| `clipboard_track` | `Track \| None` | Track clipboard |
| `clipboard_instance` | `Instance \| None` | Instance clipboard |

**State mechanics**: Setting a value triggers all registered callbacks. Callbacks receive the new value. `connect(key, callback)` registers callbacks. `emit(key)` forces callbacks without changing value. `toggle(key)` flips booleans. `increment(key, step, mod)` increments numerics.

---

## 7. Dialogs

| Dialog | File | Purpose |
|--------|------|---------|
| `ShortcutDialog` | `dialogs/shortcuts.py` | View and edit keyboard shortcuts |
| `DeleteDialog` | `dialogs/delete.py` | Custom instance deletion with type/frame/track filters |
| `DeleteUserFramePredictionsDialog` | `dialogs/delete.py` | Options for deleting predictions on user frames (linked/unlinked, scope) |
| `MergeDialog` | `dialogs/merge.py` | GUI for merging two Labels datasets |
| `ReplaceSkeletonTableDialog` | `dialogs/merge.py` | Map mismatched nodes when replacing skeleton |
| `ImportVideos` | `dialogs/importvideos.py` | Video import wizard with file browser |
| `MissingFilesDialog` | `dialogs/missingfiles.py` | Locate missing video files |
| `FileDialog` | `dialogs/filedialog.py` | Wrapper for native/non-native file dialogs (open, save, openDir, openMultiple) |
| `MessageDialog` | `dialogs/message.py` | Simple progress/status message |
| `MetricsTableDialog` | `dialogs/metrics.py` | Display model evaluation metrics |
| `ExportClipDialog` | `dialogs/export_clip.py` | Configure video clip export (fps, scale, crop) |
| `RenderClipDialog` | `dialogs/render_clip.py` | Configure labeled video rendering (fps, crf, scale, color settings, preview) |
| `FrameRangeDialog` | `dialogs/frame_range.py` | Input min/max frame range |
| `SizeDistributionDialog` | `dialogs/size_distribution.py` | Instance size distribution analysis with navigation |
| `QCDockWidget` | `dialogs/qc.py` | Label quality control dock with flag navigation |
| `UpdateCheckerDialog` | `dialogs/update_checker.py` | Check for SLEAP updates |
| `YamlFormWidget` | `dialogs/formbuilder.py` | Generic form builder from YAML definitions |
| `LearningDialog` | `learning/dialog.py` | Training and inference configuration (tabbed dialog) |

---

## 8. Video Player Features

### QtVideoPlayer (`widgets/video.py`)
- **Central widget** of the main window
- **Components**: `GraphicsView` (for image + instances) + `VideoSlider` (seekbar), separated by `QSplitter`
- **Worker thread**: `FrameLoaderThread` for async frame loading
- **Signals**: `changedPlot` (new frame drawn), `updatedPlot` (node moved)

### Key capabilities:
- Frame display with `ndarray_to_qimage()` conversion (supports uint8, float32/64, uint16, 1/3/4 channels)
- Instance rendering: nodes (circles), edges (lines or wedges), labels (text)
- Zoom: fit to instances, fit to selection, manual zoom/pan
- Drag-and-drop: accepts .slp files and video files
- Context menu (right-click): Add Instance with placement options (Default, Average, Force Directed, Copy Prior Frame, Random)
- Instance selection: click to select, double-click predicted instance to convert to user instance, double-click user instance to add missing nodes
- Shift+double-click: convert prediction and mark as complete
- Area selection: `onAreaSelection()` callback for rect selection
- Sequence selection: `onSequenceSelect()` for selecting N instances in order
- Instance highlighting: cyan box around navigated-to instance
- Pinch-to-zoom gesture support

### VideoSlider / Seekbar (`widgets/slider.py`)
- Custom QWidget slider with rich mark rendering
- **Mark types**: simple, simple_thin, filled, open, predicted, tick, tick_column, track
- **Track bars**: Colored horizontal bars showing track occupancy across frames
- **Selection**: Click-drag to select frame ranges (shown as blue highlight)
- **Header**: Optional time-series graph above slider (for metrics like displacement, scores)
- **Frame marks**: Blue filled = user labels, open = predicted, colored = track occupancy
- **Navigation**: Click to seek, keyboard arrows for stepping

---

## 9. Preferences

Stored in `~/.sleap/preferences.yaml`. Managed by `Preferences` class in `prefs.py`.

| Preference | Default | Description |
|-----------|---------|-------------|
| `medium step size` | 10 | Frames to skip with Ctrl+Arrow |
| `large step size` | 100 | Frames to skip with Ctrl+Alt+Arrow |
| `color predicted` | False | Color predicted instances |
| `propagate track labels` | True | Apply track to subsequent frames |
| `palette` | "standard" | Default color palette |
| `bold lines` | False | Use thick lines (6px vs 3px) |
| `trail length` | 0 | Default track trail length |
| `trail shade` | "Normal" | Default trail shade |
| `trail width` | 4.0 | Trail line width |
| `trail node count` | 1 | Number of nodes to show trails for |
| `marker size` | 4 | Default node marker size |
| `edge style` | "Line" | Default edge style |
| `window state` | b"" | Qt window state (dock positions) |
| `node label size` | 12 | Default node label font size |
| `show non-visible nodes` | True | Show non-visible nodes |
| `share usage data` | True | Analytics opt-in |
| `node marker sizes` | (1,2,3,4,6,8,12) | Available marker size options |
| `node label sizes` | (6,9,12,18,24,36) | Available label size options |
| `training data pipeline framework` | "Cache in Memory" | Training data pipeline |
| `training num workers` | 0 | Dataloader workers |
| `training num devices` | None | GPU count (None=auto) |
| `training accelerator` | "auto" | Training accelerator |
| `default video backend` | None | Video backend (opencv/FFMPEG/pyav) |

---

## 10. Color System

### ColorManager (`color.py`)
- **Palettes**: Loaded from `config/colors.yaml`, selectable by name
- **Palette names**: standard, 5+, alphabet, and potentially custom palettes
- **Index modes**:
  - `cycle`: Wrap colors when index exceeds palette length
  - `clip`: Use last color when index exceeds length (for palettes ending with "+")
- **Color modes** (`distinctly_color`):
  - `instances`: Color by track/instance index (default)
  - `nodes`: Color each node differently
  - `edges`: Color each edge differently
- **Predicted instances**: When `color_predicted=False`, nodes are yellow (250,250,10), edges are gray (128,128,128)
- **Pen widths**: thick (3 or 6 if bold), medium (thick/2), default (max(1, thick/4))
- **Pseudo-tracks**: Instances without tracks get colors based on their position in the frame's instance list

---

## 11. Data Views / Tables

All tables use `GenericTableModel` and `GenericTableView` from `sleap/gui/dataviews.py`.

| Model | Used In | Shows |
|-------|---------|-------|
| `VideosTableModel` | VideosDock | Video filename, frames, dimensions |
| `SkeletonNodesTableModel` | SkeletonDock | Node name, symmetry partner |
| `SkeletonEdgesTableModel` | SkeletonDock | Source → Destination edges |
| `SkeletonNodeModel` | SkeletonDock dropdowns | Node names for edge source/dest combo boxes |
| `SuggestionsTableModel` | SuggestionsDock | Video, frame index, labeled status |
| `LabeledFrameTableModel` | InstancesDock | Instance type (user/predicted), track, score |

### Table features:
- Row selection triggers state updates (`selected_video`, `selected_node`, etc.)
- Double-click: navigate to item (e.g., double-click suggestion to go to that frame)
- Sortable (SuggestionsTableModel)
- Multiple selection (VideosTableModel)
- Ellipsis truncation from left (for long file paths)

---

## 12. Additional Features

### Drag and Drop
- **Single .slp file**: Load (if no project) or Merge (if project loaded)
- **Video files**: Import videos via `ImportVideos` dialog
- **Supported**: Direct drop on main window or video player

### Status Bar
Displays: `Video X/Y | Frame: N/M | Selection: A-B (C frames) | Labeled Frames: N in video, M in project | Predicted Frames: N (X%) | Current frame: N instances`

Red text warning when instances are hidden ("Press H to toggle").

### Close Behavior
- Prompts to save if unsaved changes (Save / Discard / Cancel)
- Saves window state (dock positions) to preferences
- Saves current state values (marker size, palette, etc.) to preferences

### Timer-based GUI State Updates
- 20ms timer (`_update_gui_state()`) enables/disables menu items based on current state
- E.g., Delete Instance disabled when no instance selected
- Track menu populated dynamically based on project tracks

### Suggestion Generation Methods
| Method | Description |
|--------|-------------|
| `sample` | Random or strided sampling |
| `image_features` | PCA + k-means on image features |
| `prediction_score` | Frames with low prediction scores |
| `velocity` | Frames with high motion |
| `frame_chunk` | Specific frame range |
| `max_point_displacement` | Frames with large point movement |

### Learning Dialog (Training/Inference)
- **Modes**: "training", "inference"
- **Frame selection options**: current frame, clip, video, all videos, suggestions, random, user-labeled, predicted
- **Features**: Model configuration tabs, wandb integration, size distribution widget, frame target selector
- **Post-completion**: Merges predictions into project, updates all displays
