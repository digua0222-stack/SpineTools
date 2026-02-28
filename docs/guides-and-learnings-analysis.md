# Guides and Learnings Analysis for SLEAP Label Web

Analysis of SLEAP's official guides and learnings docs, mapped against the current
web app implementation. Identifies advanced workflows, GUI design insights,
tracking/proofreading gaps, quality control needs, and import/export workflows.

---

## 1. Advanced Workflows from Guides

### 1.1 Active Learning Loop (prediction-assisted-labeling.md)

The central SLEAP workflow is an iterative cycle:
**Label -> Train -> Predict -> Correct -> Repeat**

**What the web app needs to support:**

| Step | Current Status | Gap |
|------|---------------|-----|
| Label frames manually | Implemented | Node placement, instance add/delete work |
| Train model | N/A (server-side) | Need placeholder UI or server delegation |
| Predict on frames | N/A (server-side) | Need to load prediction results from SLP |
| Convert prediction to user instance | **Missing** | Double-click on predicted instance should convert it |
| Correct converted instances | Implemented | Node dragging works |
| See which nodes were adjusted vs unchanged | **Missing** | Red vs green node coloring after conversion |

**Priority**: The prediction-to-user-instance conversion (double-click) is critical.
This is the single most important labeling efficiency feature and is called out in
both the prediction-assisted labeling guide and the GUI learnings doc.

### 1.2 Tracking Workflows (tracking-and-proofreading.md)

Tracking connects frame-by-frame predictions into continuous identity tracks.
The web app must support the full proofreading workflow even if it cannot run
tracking itself.

**Tracking methods described in guides:**
- Fixed Window (default), Local Queues, Optical Flow
- Scoring: OKS, Euclidean, Cosine, IoU
- Matching: Hungarian, Greedy
- Settings: max_tracks, connect single track breaks, window size

**Web app only needs to handle proofreading of already-tracked results, not run tracking.**

### 1.3 Proofreading Setup (tracking-and-proofreading.md, main-mistakes-by-tracking.md)

Two error types to fix:
1. **Lost identities** -- new spurious track spawned
2. **Identity swaps** -- two animals' tracks get switched

**Setup requirements:**

| Feature | Current Status | Gap |
|---------|---------------|-----|
| Color Predicted Instances toggle | Implemented | Works in View menu |
| Color palettes (five+, alphabet) | Implemented | Palette picker works |
| Trail Length > 0 | **State exists, rendering missing** | No trail rendering on canvas |
| Seekbar track colors | **Missing** | No track color bars on seekbar |
| Wedge edge style for orientation | Implemented | Line/Wedge toggle works |

### 1.4 Fixing Lost Identities

**Required workflow (currently broken):**

1. **Go > Next Track Spawn Frame** -- **Missing command**. The shortcut exists but the
   command to find the next frame where a new track begins is not implemented.
2. Select the instance with the new track -- Implemented (click selection).
3. View trail to determine correct track -- **Missing** (no trail rendering).
4. **Hold Ctrl to show tracks legend** -- **Missing**. No overlay showing numbered
   track list with colors.
5. **While holding Ctrl, press 1-9 to assign track** -- **Missing**. Set Instance Track
   via digit shortcut (Ctrl+1-9) is not implemented. This is flagged as P0 in the
   missing features audit but still not done.

**This is the single most critical gap for multi-animal workflows.**

### 1.5 Fixing Identity Swaps

**Strategy 1: Visual inspection with trails**
- Set trail length ~50 frames -- **Missing** (no trail rendering)
- Use large frame step to scan -- Implemented (Ctrl+Alt+Arrow)
- Look for crossed/tangled trails -- **Missing** (no trails)
- Find exact swap frame, use Transpose -- Implemented (Ctrl+T)
- **Labels > Transpose Instance Tracks** -- Implemented

**Strategy 2: Velocity-based suggestions**
- Open Labeling Suggestions panel -- Implemented (panel exists)
- Select velocity method -- **Missing** (no suggestion generation methods)
- Choose stable node, adjust threshold -- **Missing**
- Step through suggestions -- Implemented (Space/Shift+Space)

**Propagating fixes:**
- **Propagate Track Labels** toggle -- **Missing**. When enabled, a track assignment
  change should automatically apply to all subsequent frames. This is critical for
  efficient proofreading -- without it, users must fix each frame individually.

### 1.6 Label Quality Control (label-quality-control.md)

New in SLEAP 1.6. Automated detection of labeling errors using GMM-based anomaly detection.

**Complete feature set needed:**

| Feature | Feasibility | Notes |
|---------|------------|-------|
| Analyze > Label QC menu item | Easy | Add menu entry |
| QC Panel (dockable) | Medium | New panel component |
| Run Analysis button | Hard | Needs QC algorithm in JS or server-side |
| Sensitivity slider | Easy | Threshold control |
| Score Distribution histogram | Medium | Chart component (e.g., recharts) |
| Issue Breakdown bar chart | Medium | Chart component |
| Features box plots | Medium | Chart component |
| Flagged Instances table | Easy | Sortable table with click-to-navigate |
| Selected Instance detail | Easy | Panel showing score, issue, top features |
| Statistics summary | Easy | Count, percentile display |
| Add to Suggestions button | Easy | Push flagged frames to suggestions list |
| Export CSV | Easy | Generate and download CSV |
| Fit to Selection toggle | Easy | Auto-zoom on selected instance |

**Assessment**: The QC feature is analytically complex (GMM fitting, feature extraction)
but the UI is straightforward. Could potentially run the analysis server-side or use
a WASM-compiled stats library. The table + navigation part is high-value even without
the full analysis -- could start with manual flagging.

### 1.7 Instance Size Distribution (instance-size-distribution.md)

Analysis widget for choosing crop sizes for top-down models.

| Feature | Feasibility |
|---------|------------|
| Scatter plot of instance sizes | Medium (charting library) |
| Histogram view | Medium |
| Click-to-navigate on points | Easy |
| Rotation augmentation preview | Medium (geometry calc) |
| Statistics panel (percentiles, mean, etc.) | Easy |

**Assessment**: Lower priority for web app since training config happens elsewhere,
but useful for data exploration.

### 1.8 Training Profile Configuration (creating-a-custom-training-profile.md)

The guide describes the GUI dialog for configuring training hyperparameters:
- Pipeline type selection (top-down, bottom-up, single animal)
- Model configuration tabs per pipeline component
- Save configuration files button
- Export training job package

**Web app implications**: Even if training runs elsewhere, the web app could provide:
- **Export Training Job Package** -- bundle labels + config for remote training
- **Training profile editor** -- create/edit YAML configs
- **Save configuration files** -- export configs for CLI use

### 1.9 Remote Training / Colab (running-sleap-remotely.md, run-training-and-inference-on-colab.md)

Key workflow: Export training job package from GUI -> copy to remote -> train -> copy back predictions -> load in GUI.

**Web app needs:**

| Feature | Priority | Notes |
|---------|----------|-------|
| Export Training Job Package (.pkg.slp) | P1 | Critical for remote training workflow |
| Export Training Job Package as ZIP | P1 | Alternative format |
| Load predictions from separate SLP file | P1 | Already works via Open |
| Merge predictions into project | P1 | Merge Data From... dialog needed |
| Google Colab link | P2 | Simple URL open |

### 1.10 Importing Predictions for Labeling (importing-predictions-for-labeling.md)

Describes the workflow for merging corrected predictions back into the training project.

**Critical missing features:**

1. **Double-click predicted instance to convert** -- Not implemented. This is how users
   "accept" a prediction for training. Currently no way to convert predictions to
   editable instances in the web app.

2. **Merge Data From...** -- File > Merge Data From menu item. Opens a merge dialog
   showing conflicts (frames with both user and predicted instances). User resolves
   conflicts by choosing base/new/neither.

3. **Delete All Predictions** -- Implemented (in Labels menu).

4. **Save As...** -- Partially implemented (JSON only, no .slp save).

---

## 2. GUI Design Learnings

### 2.1 Mouse Controls (gui.md)

Several mouse interactions are documented but not implemented:

| Interaction | Status | Priority |
|-------------|--------|----------|
| Zoom in/out (mouse wheel) | Implemented | -- |
| Pan (left-click drag) | **Different** -- web uses middle-click | P1: Consider adding left-click pan |
| Toggle node visibility (right-click on node) | Implemented | -- |
| Add instance (right-click elsewhere) | Partially -- context menu exists | -- |
| Zoom to region (Alt+left-click drag) | **Missing** | P2 |
| Zoom out (Alt+double-click) | **Missing** | P2 |
| Move entire instance (Alt+drag on node) | **Missing** | P1 |
| Rotate entire instance (Alt+mouse wheel on node) | **Missing** | P2 |
| Create instance from prediction (double-click) | **Missing** | P0 |
| Add missing nodes to instance (double-click editable) | **Missing** | P1 |
| Select instance (click) | Implemented | -- |
| Clear selection (click elsewhere) | Implemented | -- |
| Duplicate instance (Ctrl+drag) | **Missing** | P2 |

**Key insight**: The SLEAP desktop GUI uses **left-click drag for pan** and modifier
keys (Alt, Ctrl) for alternative actions. The web app uses middle-click for pan.
This is a significant ergonomic difference -- many laptop users have no middle button.

### 2.2 Keyboard Navigation (gui.md)

| Key | Action | Status |
|-----|--------|--------|
| Arrow keys for frame step | Implemented | -- |
| Ctrl+Arrow for medium step | Implemented | -- |
| Ctrl+Alt+Arrow for large step | Implemented | -- |
| Home/End for first/last | Implemented | -- |
| Shift+navigation for selection | **Missing** | P1 |
| 1-9 to select instance by number | Partially (shortcuts exist) | Verify |
| **Ctrl (hold) show tracks legend** | **Missing** | P1 |
| Escape to deselect | Implemented | -- |

### 2.3 Seekbar Controls (gui.md)

| Action | Status |
|--------|--------|
| Select frame range (Shift+drag) | **Missing** |
| Clear selection (Shift+click) | **Missing** |
| Zoom to range (Alt+drag) | **Missing** |
| Zoom out / show all (Alt+click) | **Missing** |

The seekbar is currently a basic slider with no marks, no range selection, no zoom.
This significantly limits navigation efficiency.

### 2.4 Labeling Suggestions Methods (gui.md)

| Method | Description | Feasibility in Web |
|--------|-------------|-------------------|
| Sample | Evenly spaced or random frames | Easy -- pure math |
| Image Features | Visually distinctive frames | Hard -- needs feature extraction |
| Prediction Score | Low-confidence frames | Medium -- needs score data in SLP |
| Velocity | Fast-moving instances | Medium -- needs tracking data |

**The "Sample" method should be implemented first** -- it requires no ML and provides
immediate value for initial labeling workflows. The "Prediction Score" and "Velocity"
methods could work if the score/tracking data is already in the loaded SLP file.

### 2.5 Color and Visualization (gui.md)

| Feature | Status | Notes |
|---------|--------|-------|
| Apply Distinct Colors To (tracks/nodes/edges) | State exists, not wired | Need menu + renderer |
| Custom color palette file (~/.sleap/colors.yaml) | Not applicable | Use localStorage |
| "+" palettes that don't cycle | Check if implemented | Useful for proofreading |
| Trail Length for proofreading | State exists, no rendering | Canvas trail lines needed |
| Seekbar Header metric options | Not implemented | Time-series graph |
| Crop Size Overlay | Not implemented | Shows training crop region |

### 2.6 Menus Comparison (gui.md vs MenuBar.tsx)

**Menus present in SLEAP GUI but missing from web app:**

1. **Predict menu** -- Entirely absent. Even without training/inference, should have:
   - Add Instances from All Predictions on Current Frame
   - Delete predictions variants (clip, area, low score, frame limit, user-labeled frames)
   - Export Video with Visual Annotations
   - (placeholder) Run Training / Run Inference

2. **Analyze menu** -- Entirely absent. Should have:
   - Instance Size Distribution
   - Label QC

3. **Help menu** -- Entirely absent. Should have:
   - Keyboard Shortcuts
   - Documentation link
   - About dialog

---

## 3. Tracking and Proofreading -- What's Missing

### 3.1 Complete Proofreading Workflow Gap Analysis

The proofreading workflow described in guides requires these features working together:

```
Phase 1: Setup
  [x] Load SLP with predictions and tracks
  [x] Color Predicted Instances toggle
  [x] Choose color palette
  [ ] Set Trail Length > 0            <-- NO TRAIL RENDERING
  [ ] Seekbar shows track colors      <-- NO SEEKBAR MARKS

Phase 2: Find Lost Identities
  [ ] Go > Next Track Spawn Frame     <-- COMMAND NOT IMPLEMENTED
  [x] Select instance
  [ ] View trail to see where it came from  <-- NO TRAILS
  [ ] Hold Ctrl for tracks legend     <-- NO OVERLAY
  [ ] Press digit to assign track     <-- Ctrl+1-9 NOT IMPLEMENTED

Phase 3: Find Identity Swaps
  [ ] Set long trail length           <-- NO TRAILS
  [x] Large frame step navigation
  [ ] Visual inspection for crossed trails  <-- NO TRAILS
  [x] Transpose Instance Tracks (Ctrl+T)
  [ ] Velocity-based suggestions      <-- NO SUGGESTION GENERATION

Phase 4: Propagate Fixes
  [ ] Propagate Track Labels toggle   <-- NOT IMPLEMENTED
  [ ] Track changes apply to subsequent frames  <-- NOT IMPLEMENTED
```

**Conclusion**: The proofreading workflow is almost entirely non-functional due to
three missing capabilities: trail rendering, track spawn navigation, and track
assignment shortcuts.

### 3.2 Track Management Commands Missing

| Command | Description | Priority |
|---------|-------------|----------|
| Next Track Spawn Frame | Navigate to frame where new track starts | P0 |
| Set Instance Track (Ctrl+1-9) | Quick track assignment via keyboard | P0 |
| Propagate Track Labels | Apply changes to subsequent frames | P1 |
| Delete Instance and Track | Remove instance + all same-track instances | P1 |
| Delete Track | Remove track from all instances | P1 |
| Delete Multiple Tracks | Clean up unused/all tracks | P1 |
| Set Track Name | Rename tracks for clarity | P1 |
| Connect Single Track Breaks | Auto-merge single lost+gained track pairs | P2 |

### 3.3 Trail Rendering

The trail overlay shows colored lines tracing where each instance was in prior frames.
This is essential for:
- Detecting identity swaps (crossed trails)
- Verifying tracking continuity
- Understanding movement patterns

**Implementation approach:**
1. For each visible instance, look back `trailLength` frames
2. Find same-track instances in those frames
3. Draw lines connecting the centroid positions, colored by track
4. Fade opacity with distance from current frame

The `trailLength` state already exists in the app store (default 0). The renderer
needs to be added to SkeletonRenderer.ts or a dedicated trail layer.

---

## 4. Quality Control Features Needed

### 4.1 Label QC Panel (from label-quality-control.md)

The QC system detects these issue types:
- Unusual Visibility (unusual visible/invisible node patterns)
- Unusual Edge Length (skeleton edge much longer/shorter than typical)
- Unusual Node Spacing (nodes too close or far)
- Unusual Scale (instance much larger/smaller)
- Unusual Joint Angle (abnormal joint bend)
- High Hull Area (convex hull unusually large)
- Likely L/R Swap (left/right limbs swapped)

**Implementation tiers:**

**Tier 1 (UI only, no analysis):**
- QC panel with manual flagging
- Table of flagged instances with click-to-navigate
- Add flagged frames to suggestions

**Tier 2 (Basic analysis):**
- Compute edge lengths, bounding box sizes per instance
- Simple z-score outlier detection
- Histogram of scores

**Tier 3 (Full GMM analysis):**
- Feature extraction (edge lengths, angles, hull area, spacing)
- GMM fitting for anomaly detection
- Full score distribution, issue breakdown, feature comparison charts

### 4.2 Instance Size Distribution (from instance-size-distribution.md)

**Tier 1:**
- Compute bounding box sizes for all user instances
- Show statistics (mean, median, percentiles)
- Simple histogram

**Tier 2:**
- Scatter plot with click-to-navigate
- Rotation augmentation preview
- Outlier identification

### 4.3 Quality Checks Before Training

The guides emphasize running QC before training:
> "Run QC after initial labeling but before training to catch errors early"
> "Re-run after proofreading tracking results to verify corrections"

The web app should prompt users to review quality before exporting training packages.

---

## 5. Import/Export Workflows Needed

### 5.1 Import Workflows

| Format | Source | Priority | Feasibility |
|--------|--------|----------|-------------|
| SLP (native) | SLEAP | Done | Implemented |
| COCO JSON | Various tools | P2 | Medium -- JSON parser needed |
| DeepLabCut CSV | DLC | P2 | Medium -- CSV + config parser |
| DeepPoseKit HDF5 | DPK | P3 | Hard -- specialized format |
| LEAP MAT | LEAP | P3 | Hard -- MATLAB format |
| Analysis HDF5 | SLEAP export | P2 | Medium -- h5wasm reading |
| Predictions SLP | SLEAP inference | Done | Same as regular SLP open |

### 5.2 Export Workflows

| Format | Purpose | Priority | Feasibility |
|--------|---------|----------|-------------|
| SLP (native) | Save work | P0 | Blocked on sleap-io.js browser save |
| JSON (dict) | Data exchange | Done | Implemented |
| Analysis CSV | Downstream analysis | P1 | Easy -- tabular data generation |
| Analysis HDF5 | MATLAB/Python analysis | P1 | Medium -- h5wasm writing |
| Training Job Package (.pkg.slp) | Remote training | P1 | Medium -- bundle labels + video frames |
| Training Job ZIP | Remote training | P1 | Easy -- if .pkg.slp works |
| NWB | Neurodata Without Borders | P2 | Hard -- specialized format |
| COCO JSON | Model evaluation | P2 | Medium |
| Video with Annotations | Visualization | P2 | Hard -- canvas recording |

### 5.3 Merge Workflow (from importing-predictions-for-labeling.md)

The **File > Merge Data From...** workflow is critical for the active learning loop:

1. User opens main project
2. File > Merge Data From... opens file picker
3. Load second SLP file
4. Show merge dialog:
   - Skeleton comparison (must match or map)
   - Conflict detection (same video + frame with instances in both)
   - Resolution options: use base, use new, skip
   - Count of clean-merge frames
5. User clicks "Finish Merge"
6. Merged data added to current project

**Implementation complexity**: Medium-high. Needs skeleton matching logic, frame-level
conflict detection, and a multi-step dialog.

### 5.4 Training Job Package Export

For remote training (including Colab), users need to export:
1. Labels subset (training frames only)
2. Cropped images for those frames (embedded in .pkg.slp)
3. Training configuration YAML files
4. Shell script with train command

The web app could at minimum export the labels + images as a package, with the user
providing their own training config.

---

## 6. Skeleton Design Insights (skeleton-design.md)

### 6.1 Design Guidelines for the Skeleton Panel

The learnings doc highlights common mistakes that the web app's skeleton editor
should help users avoid:

| Mistake | How to Help |
|---------|------------|
| Too many nodes | Show node count prominently (done), consider a warning above ~15 |
| Deep edge chains | Could visualize graph depth, warn about long chains |
| Ambiguous landmarks | Tooltip guidance when adding nodes |
| Symmetric naming confusion | Suggest L_/R_ prefix convention |

### 6.2 Skeleton Templates

The SkeletonPanel has a template selector but it's not wired up (logs to console).
Templates mentioned: Fly (32 nodes), Mouse top-down (12), Mouse side-view (8),
Human (17), Hand (21).

**Action**: Wire up template loading with actual skeleton definitions.

### 6.3 Modifying Existing Skeletons

When users modify a skeleton (add/remove nodes), all existing instances need updating:
- Adding a node: new node appears as non-visible on all existing instances
- Removing a node: node data removed from all instances, connected edges removed
- Edge changes: visualization only (unless using bottom-up inference)

The current SkeletonPanel handles add/remove of nodes and edges, but does not
propagate changes to existing instances.

---

## 7. System Architecture Insights (system-overview.md)

### 7.1 Three-Package Architecture

```
sleap (GUI) -> sleap-io (data) -> sleap-nn (ML)
```

The web app maps to:
- **sleap** -> sleap-label-web (this project)
- **sleap-io** -> @talmolab/sleap-io.js
- **sleap-nn** -> not applicable in browser (could delegate to server)

### 7.2 Workflow Stage Coverage

| Stage | Sub-step | Web App Status |
|-------|----------|---------------|
| Data Prep | Import videos | Partial (via SLP only) |
| Data Prep | Create skeleton | Implemented |
| Data Prep | Label frames | Implemented |
| Data Prep | Import existing labels | Missing |
| Training | Configure model | Missing |
| Training | Train | N/A (server) |
| Training | Monitor | N/A (could show pre-computed) |
| Training | Evaluate | Missing |
| Inference | Run inference | N/A (server) |
| Inference | Track identities | N/A (server) |
| Inference | Proofread | **Mostly missing** |
| Inference | Export | Partial (JSON only) |

---

## 8. Priority Recommendations

### Highest Priority (Blocks Core Workflows)

1. **Double-click prediction to convert to user instance** -- Blocks the entire
   prediction-assisted labeling loop. Without this, users cannot correct predictions.

2. **Set Instance Track via Ctrl+1-9** -- Blocks all track editing. Users cannot
   efficiently assign tracks during proofreading.

3. **Next Track Spawn Frame navigation** -- Blocks lost identity proofreading.
   Users cannot find where new tracks appear.

4. **Trail rendering** -- Blocks visual proofreading. Users cannot see movement
   paths to detect swaps.

5. **Seekbar frame marks** -- Blocks efficient navigation. Users cannot see where
   labels and predictions exist.

### High Priority (Major UX Gaps)

6. **Propagate Track Labels** -- Without this, track fixes must be applied frame-by-frame.

7. **Move entire instance (Alt+drag)** -- Common editing action, missing modifier.

8. **Ctrl+hold tracks legend overlay** -- Visual reference during track assignment.

9. **Suggestion generation (Sample method)** -- Enable frame sampling for initial labeling.

10. **Merge Data From...** -- Enable merging predictions from separate files.

### Medium Priority (Important but Workaroundable)

11. Export Training Job Package
12. Label QC panel (at least Tier 1)
13. Instance Size Distribution
14. Seekbar frame range selection
15. Delete prediction variants (clip, score, area)

---

## 9. Cross-References

- Tutorial analysis: see `docs/tutorial-to-web-mapping.md` (from tutorial-reviewer)
- Missing features audit: see `docs/missing-features-audit.md`
- Architecture docs: see `docs/architecture.md`
- SLEAP GUI features reference: see `docs/sleap-gui-features.md`
