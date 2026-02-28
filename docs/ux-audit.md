# UX Red-Team Audit

Comprehensive audit of all UI components and interactions in SLEAP Label Web.
Severity ratings: **Critical** (blocks core workflows), **High** (significant usability issue), **Medium** (noticeable friction), **Low** (polish/nice-to-have).

---

## Table of Contents

1. [AppShell](#appshell)
2. [MenuBar](#menubar)
3. [StatusBar](#statusbar)
4. [WelcomeScreen](#welcomescreen)
5. [VideoPlayer](#videoplayer)
6. [Seekbar](#seekbar)
7. [ContextMenu](#contextmenu)
8. [VideosPanel](#videospanel)
9. [InstancesPanel](#instancespanel)
10. [SkeletonPanel](#skeletonpanel)
11. [SuggestionsPanel](#suggestionspanel)
12. [App Store (State Management)](#app-store)
13. [Command System](#command-system)
14. [Keyboard Shortcuts](#keyboard-shortcuts)
15. [SkeletonRenderer](#skeletonrenderer)
16. [Platform Abstraction](#platform-abstraction)
17. [File I/O](#file-io)
18. [Test Coverage](#test-coverage)
19. [Cross-Cutting Concerns](#cross-cutting-concerns)

---

## AppShell

**File:** `src/components/layout/AppShell.tsx`

### Critical

1. [FIXED] **Duplicate drag-and-drop handlers with divergent logic.** Now uses consolidated `loadProjectFromFile()` for all loading paths.

2. [FIXED] **No unsaved changes warning.** Unsaved changes check added via `loadProject.ts` which checks `hasChanges` before loading.

### High

3. [FIXED] **No global error boundary.** `ErrorBoundary.tsx` wraps `AppShell`, catches render errors and shows fallback UI with reload button.

4. **Side panel tabs have no ARIA labels or keyboard accessibility.** Tab focus management works via Radix but the tab panel content areas have no `aria-label` describing their purpose.

5. [FIXED] **No loading indicator during SLP file load from AppShell drop handler.** Loading indicator now shown via consolidated loading path.

### Medium

6. **Side panel tabs always default to "videos" on mount.** When switching between welcome and project views, the panel always resets to the Videos tab instead of remembering the user's last active tab.

7. **Drag-and-drop in AppShell only accepts `.slp` files.** Non-SLP files are silently ignored with no feedback. User could drag a `.json` or `.h5` file and wonder why nothing happened.

### Low

8. **No drag-over visual indicator on the main shell.** When dragging a file over the project area, there is no visual cue (highlight, border change) indicating that drop is supported.

---

## MenuBar

**File:** `src/components/layout/MenuBar.tsx`

### Critical

9. **EditMenu undo/redo labels read from `commandContext` singleton at render time but are NOT reactive.** The `undoLabel` and `redoLabel` are computed from `commandContext.canUndo`/`commandContext.undoCommandName` which are plain class properties -- not Zustand state. The menu items will show stale undo/redo labels after the initial render because there is no subscription triggering a re-render when the undo stack changes.

10. **`window.close()` in Quit menu item does not work in most browsers.** `window.close()` only works if the window was opened by `window.open()`. In a standard browser tab it silently does nothing. No confirmation dialog for unsaved changes before quit.

### High

11. **ViewMenu `markerSize` slider and palette radio group read from `useAppStore.getState()` inline.** Lines 309-315 and 322-323 use `getState()` directly, which returns the state at render time but does NOT re-render when values change. Moving the slider does not update the displayed number. Selecting a palette does not show the correct radio selection.

12. **LabelsMenu subscribes to `labels` object directly.** Since the labels object is mutable and the same reference is reused, `totalLabeled` and `totalInstances` may show stale counts after adding/deleting instances because the reference does not change.

13. **Save menu item saves as JSON via browser download, not as SLP.** Named "Save" (Ctrl+S) but exports JSON, which is misleading. Users expect to save in the same format they opened. Save and Export JSON both do the same thing.

### Medium

14. [FIXED] **No disabled states for commands that require context.** Menu items now have `disabled` props based on store state (e.g., Delete Instance disabled when no instance selected, Paste disabled when clipboard empty, navigation disabled when no project loaded).

15. **GoMenu inline handlers for Next/Previous Video and Select Next Instance are duplicated.** The same logic exists in `useKeyboardShortcuts.ts`. If the logic needs to change, it must be updated in two places.

16. **`confirm()` dialog for Delete All Predictions.** Uses the browser's native `confirm()` which is ugly, blocking, and cannot be styled. Should use a custom dialog component.

17. [FIXED] **"Save As..." menu item is disabled with no tooltip or explanation.** Save As now works via `SaveAsJsonCommand` with file picker and auto-versioned filenames.

### Low

18. [FIXED] **No Help menu** with keyboard shortcut reference, about dialog, or link to documentation. Help menu now includes Keyboard Shortcuts dialog, About dialog, GitHub link, and documentation link.

19. **No "Recent Projects" in File menu.** Common desktop app pattern that would improve workflow.

---

## StatusBar

**File:** `src/components/layout/StatusBar.tsx`

### High

20. **Unsafe type cast for predicted instance score.** Line 66: `(instance as unknown as { score: number }).score.toFixed(3)` will crash if score is `undefined` or `null`, despite the `isPredicted` guard. The `isPredicted` check only verifies `"score" in instance`, not that the value is a number.

### Medium

21. **"Frame 0 / 99" off-by-one confusion.** Frames are 0-indexed but users may expect 1-indexed display. The SLEAP desktop app shows both, but here only 0-indexed is shown.

22. **No click-to-navigate on frame number.** Users cannot click the frame number to type a specific frame to jump to.

23. **Instance info shows `nVisible` which may not track correctly** if the data model is mutated directly (which happens during node dragging).

### Low

24. **"[no track]" shown for untracked instances** could be confusing. A more descriptive label like "untracked" or hiding the track info entirely would be clearer.

25. **No indication of total instance count across all frames** (only current frame count shown).

---

## WelcomeScreen

**File:** `src/components/layout/WelcomeScreen.tsx`

### High

26. **Background image `/background.jpg` may not exist.** If the file is missing, the background fails silently (no visible error, just no image), but it could cause a noticeable layout shift.

27. **Error message display is basic text.** No way to copy the error message, no "Try Again" button, and no guidance on what went wrong.

### Medium

28. **No visual feedback during drag-over.** The drop zone does not change appearance (e.g., highlighted border, color change) when a file is dragged over it, violating drag-and-drop UX conventions.

29. **Icon image `/icon.png` has no fallback.** If missing, shows a broken image icon.

30. **No version information displayed.** Users have no way to know which version of the app they are running.

### Low

31. **No "recent files" list** on the welcome screen for quick access to previously opened projects.

32. **Keyboard shortcut hint says "Ctrl+O" but keyboard focus is on the button.** Pressing Enter on the focused button or Ctrl+O both work, but neither is clearly indicated as the primary action.

---

## VideoPlayer

**File:** `src/components/video/VideoPlayer.tsx`

### Critical

33. **No loading state during frame fetching.** When navigating frames, `video.backend.getFrame(frameIdx)` is async but the canvas shows the previous frame until the new one loads. On slow backends or large frames, this causes the video to appear frozen with no indication that loading is happening.

34. **Race condition in frame loading.** The `cancelled` flag in the frame loading effect prevents stale updates, but rapid frame navigation (e.g., holding arrow key) fires many concurrent `getFrame()` calls. There is no debouncing or request cancellation at the backend level, potentially causing memory pressure and frame ordering issues.

35. [FIXED] **Node placement directly mutates instance data.** `BeginEdit` command now takes an undo snapshot before node placement begins, making placement undoable.

### High

36. [FIXED] **Drag operations bypass undo/redo.** `BeginEdit` command is now executed at the start of each drag, taking an undo snapshot. Drag mutations are undoable.

37. **No cursor change on hover over draggable nodes.** The cursor is always "crosshair" or "cell" but does not change to indicate which nodes can be dragged, violating affordance principles.

38. **Canvas zoom/pan state is local (useState).** If the component remounts (which can happen during React reconciliation), all zoom/pan state is lost. This state should live in the store or a ref.

39. **`handleWheel` calls `e.preventDefault()` which prevents page scrolling.** This is correct when the mouse is over the canvas, but the handler is on a `div` container that may extend beyond the canvas area.

40. **No zoom limits feedback.** Zoom is clamped to [0.1, 20] silently. Users at max zoom who scroll more get no feedback that they've hit the limit.

### Medium

41. **Frame info badge always visible.** The `Frame X / Y | Z%` badge at bottom-left is always shown, even when it overlaps with instances or is not needed. No way to toggle it off.

42. **Node placement mode has no exit mechanism via button/click.** Users must finish placing all nodes or press Escape. There is no "Cancel placement" button or way to skip specific nodes.

43. **Hit test threshold is fixed at `markerSize * 2` for nodes and 30px for instances.** These do not scale with zoom level. At high zoom, nodes are very easy to click; at low zoom, they are nearly impossible.

44. **Object-contain CSS on canvases.** Both canvases use `object-contain` which introduces blank space around the video. This blank space is still interactive (can pan/zoom on it) but shows no content.

45. **`setLabeledFrame(useAppStore.getState().labeledFrame)` used as a force-rerender hack** (lines 329-331, 396-398). This is fragile -- it relies on immer detecting a new draft. A dedicated `forceOverlayRedraw` mechanism would be more robust.

### Low

46. **No minimap for large zoom levels.** When zoomed in, users lose context of where they are in the frame.

47. [FIXED] **No touch/trackpad gesture support.** Pinch-to-zoom now implemented via Ctrl+scroll detection (browsers set ctrlKey for trackpad pinch gestures). Uses finer zoom steps for smooth experience.

48. **Double-click to reset zoom is undiscoverable.** No tooltip, documentation, or hint that double-clicking resets the view. (Note: double-click now also converts predictions when clicking on them.)

---

## Seekbar

**File:** `src/components/video/Seekbar.tsx`

### High

49. **Seekbar does not resize correctly.** The canvas resolution is set in the render effect based on `container.getBoundingClientRect()`, but the resize handler on line 206 triggers re-render by calling `setFrameIdx(frameIdx)` -- a hacky approach that also clears the instance selection (because `setFrameIdx` always nulls the instance).

50. **Hardcoded `fps = 30`.** Video FPS is assumed to be 30. Many scientific videos are 25, 60, or even 120 fps. Playback speed will be wrong for non-30fps videos.

51. **Hardcoded seekbar background color `#1a1a2e`.** This does not respect the theme/dark mode system. It should use CSS variables.

52. **Playback does not stop at end of video.** `incrementFrameIdx` wraps around, so playback loops forever with no option for stop-at-end behavior.

### Medium

53. **No frame tooltip on hover.** When hovering over the seekbar, only a thin white line is shown. A tooltip showing the frame number would be much more useful.

54. **No keyboard accessibility for seekbar.** Cannot scrub via arrow keys when the seekbar is focused. The seekbar has no `role`, no `tabIndex`, and no `aria-label`.

55. **Track occupancy bars iterate over ALL labeled frames.** Lines 138-146: For each track, the code iterates over all `labels.labeledFrames` filtering by current video. For large datasets (10K+ frames), this is O(tracks * frames) on every render.

56. **No labeled frame mark tooltips.** The colored dots on the seekbar have no hover behavior to show which frame they represent.

57. **Playback speed popup has no keyboard shortcut** to cycle speeds (common in video players: Shift+> / Shift+<).

### Low

58. **Playback button group has no visual separation** from the seekbar canvas. The controls blend together.

59. **Speed selector shows "1x" in a tiny button** that is hard to read and hard to click (8px wide effective target).

---

## ContextMenu

**File:** `src/components/video/ContextMenu.tsx`

### High

60. [FIXED] **Context menu position is not clamped to viewport.** Menu position is now clamped to viewport bounds using `clampedPos` state with viewport dimension checks.

61. **Context menu is a custom implementation.** It uses a positioned `div` with manual click-outside handling. It does not support keyboard navigation (arrow keys to move between items, Enter to select), unlike the Radix-based menu components used in the MenuBar.

62. **`instanceIdx` prop is accepted but unused** (destructured but not used in the component body). This is a code smell suggesting incomplete implementation.

### Medium

63. **Shortcut labels in context menu are hardcoded strings** ("Ctrl+C", "Ctrl+Bksp") that do not respect the `modKey` utility. On Mac, these should show the Command symbol.

64. **No "Mark All Nodes Visible" / "Mark All Nodes Non-Visible" option.** Only single-node visibility toggle is available.

65. **No divider between track assignment and general actions** when there are no tracks (the separator shows between sections that may not both be present).

### Low

66. **Context menu items do not show their disabled state for destructive actions** when preconditions are not met (e.g., "Delete Instance" when no instance is selected).

---

## VideosPanel

**File:** `src/components/panels/VideosPanel.tsx`

### Critical

67. **"Add Videos" and "Remove Video" buttons are non-functional.** They only `console.log()`. These are core workflow actions that appear clickable but do nothing, with no indication that they are stubs.

### High

68. **Using array index as React `key`** (`key={i}` on line 118). If videos are reordered or removed, React may incorrectly reuse DOM elements, causing state bugs.

69. **No keyboard navigation in video list.** Cannot use arrow keys to move between videos or Enter to select.

### Medium

70. **Video row truncation is hardcoded to 30 characters.** Long filenames are truncated but the threshold does not adapt to panel width.

71. **No indication which video is being used for the current frame.** The orange highlight shows the selected video but there is no visual cue connecting it to the video player.

72. **Video shape can be null** but the display shows "?" instead of "loading" or "unknown", which may confuse users.

### Low

73. **No video thumbnail preview.** Users must rely on filenames alone to identify videos.

74. **No bulk selection or multi-video operations.**

---

## InstancesPanel

**File:** `src/components/panels/InstancesPanel.tsx`

### High

75. **Panel re-queries `labels.find()` independently from VideoPlayer.** Lines 98-100 duplicate the labeled frame lookup that VideoPlayer already does. These can return different results due to race conditions.

76. **Using array index as React key** (`key={i}` on line 131). Instance reordering (e.g., after delete) will cause stale DOM reuse.

77. **Delete Instance button is always enabled** even when no instance is selected. Clicking it silently does nothing.

### Medium

78. **No visual indication of which nodes are visible vs non-visible** in the instance list. Only the total visible/total count is shown.

79. **No drag-to-reorder instances.** SLEAP desktop allows reordering instances which affects rendering order.

80. **Score column shows "--" for user instances** which wastes horizontal space. Could be hidden or right-aligned more efficiently.

### Low

81. **Color swatch is very small (12x12px).** Hard to distinguish similar colors in the palette.

82. **No instance rename/relabel capability** directly from the panel.

---

## SkeletonPanel

**File:** `src/components/panels/SkeletonPanel.tsx`

### Critical

83. [FIXED] **Skeleton editing directly mutates the data model** without going through the command system. All skeleton operations now use dedicated commands (`AddNodeCommand`, `DeleteNodeCommand`, `AddEdgeCommand`, `DeleteEdgeCommand`, `RenameNodeCommand`) with undo/redo support via `installSkeletonUndoInterceptor`.

84. [FIXED] **Template selector is non-functional.** Template dropdown now loads predefined skeletons (Fly, Mouse, Human, C. elegans, Custom) via `LoadSkeletonTemplateCommand` with full undo support.

### High

85. **No validation for duplicate node names.** Adding a node with a name that already exists is allowed, which can cause confusion and edge assignment bugs. (Note: inline rename does validate for duplicates.)

86. **No validation for duplicate edges.** Adding an edge between two nodes that are already connected is allowed, creating parallel edges.

87. **Self-loop edges are possible.** The "Add Edge" dialog allows selecting the same node as both source and destination.

88. [FIXED] **Deleting a node does not update existing instances.** `DeleteNodeCommand` now removes the corresponding point from every instance when a node is deleted.

### Medium

89. **Node/Edge tables use array index as key** (`key={i}`). After deletion, indices shift and React may reuse stale rows.

90. **"New Node" auto-generates name `node_N`** but does not check for conflicts with existing names.

91. **Edge source/destination selects allow selecting the same node for both** with no client-side prevention beyond the "Add" button remaining enabled.

92. [FIXED] **No inline editing of node names.** Double-click on a node name in the table now enables inline rename with duplicate name validation.

### Low

93. **No skeleton visualization in the panel.** A small preview of the skeleton graph would help users understand the structure.

94. **No import/export of skeleton definitions** as standalone files.

---

## SuggestionsPanel

**File:** `src/components/panels/SuggestionsPanel.tsx`

### Critical

95. [FIXED] **"Generate Suggestions" and "Clear Suggestions" buttons are non-functional.** Generate now supports "stride" (evenly spaced) and "random" sampling methods with configurable count. Clear removes all suggestions.

### High

96. **Navigation to suggestion does not handle video switch atomically.** Lines 74-79: `setVideo()` resets frameIdx to 0, then `setFrameIdx()` is called separately. If the video switch triggers async frame loading, there is a brief flash of frame 0 before the correct frame loads.

### Medium

97. [FIXED] **No indication of suggestion completion status.** The suggestions table now shows a "Status" column indicating whether each frame has been labeled.

98. **No keyboard shortcut to jump to a suggestion by number.** The Space/Shift+Space shortcuts cycle sequentially but there is no way to jump to a specific suggestion.

99. **No grouping by video.** All suggestions are in a flat list. For multi-video projects, this is hard to navigate.

### Low

100. [FIXED] **No suggestion source information.** The Score column now shows the mean prediction score for each suggested frame. Column headers are clickable for sorting.

---

## App Store

**File:** `src/stores/appStore.ts`

### Critical

101. **`setFrameIdx` clears instance selection.** Every frame change nulls the instance, which means the user loses their selection when navigating. This is inconsistent with SLEAP desktop which preserves the track-matched instance across frames.

102. **`toggle` and `set` use unsafe type assertions.** `toggle` casts `state` to `Record<string, unknown>` and `set` does the same. These bypass TypeScript's type system and could set invalid state. The `toggle` function accepts any key of AppState, including non-boolean keys where toggling makes no sense.

### High

103. [FIXED] **No state persistence.** View preferences are now persisted to `localStorage` via Zustand `persist` middleware. Palette, edge style, marker size, node label size, trail length, and all show/hide flags are preserved across sessions.

104. **`labels` is stored by reference.** Since `labels` is a mutable SLEAP-io object, mutations to it outside the store (e.g., skeleton editing, direct point manipulation) do not trigger Zustand subscriptions. This is the root cause of many "stale UI" issues throughout the app.

105. **`incrementFrameIdx` wraps around at boundaries** which can be disorienting. SLEAP desktop has a preference for this. There is no way to disable wrap-around.

### Medium

106. **No maximum frame validation when video has no shape.** `setFrameIdx` allows any non-negative value, which could navigate to non-existent frames.

107. **`markChanged` sets `lastInteractedFrame` but this is never cleared** when a new project is loaded (it is cleared implicitly by `setLabels` resetting frameIdx, but `lastInteractedFrame` is not explicitly reset).

---

## Command System

**File:** `src/commands/CommandContext.ts`, `src/commands/*.ts`

### Critical

108. [FIXED] **Undo/redo only snapshots instances, not skeleton mutations.** Skeleton commands now use a dedicated undo interceptor (`installSkeletonUndoInterceptor`) that wraps `ctx.undo()`/`ctx.redo()` to also restore skeleton state (nodes, edges, instance points).

109. **`cloneInstances` does not preserve point `score` property.** Line 37-42: `clonePoints` copies `xy`, `visible`, `complete`, `name` but NOT `score`. Predicted instance points lose their per-point scores after undo/redo.

110. [FIXED] **`DeleteAllPredictions` undo is incorrect.** Now uses `takeAllFramesSnapshot()` to snapshot ALL frames before deletion, and `pushUndoSnapshot()` to register the multi-frame undo. Undoing restores all frames correctly.

### High

111. **`SaveProjectCommand` catches errors but only logs to console.** Line 91: `console.error("[SaveProject] Failed to save:", err)`. No user-visible error message. Users think save succeeded when it may have failed. (Note: toast notifications are now used for save feedback, but the error path still logs to console as well.)

112. [FIXED] **`ExportJsonCommand` has no error handling at all.** Error handling added with try/catch and toast error notification.

113. [FIXED] **`OpenProjectCommand` has no loading indicator.** Now uses consolidated `loadProjectFromFile()` which includes loading state and toast notifications.

114. [FIXED] **`NewProjectCommand` does not check for unsaved changes.** Now shows `window.confirm()` dialog if `hasChanges` is true.

### Medium

115. **`DeleteFramePredictions` sets labeledFrame to null if only predictions existed.** If the frame had only predicted instances, the labeled frame is set to null, but the LabeledFrame still exists in `labels.labeledFrames` with an empty instances array. This creates orphan empty frames.

116. **`PasteInstance` always uses the current skeleton, not the clipboard instance's skeleton.** If the skeleton has changed since the copy, pasting could create an instance with mismatched skeleton/points.

117. **`TransposeInstances` only swaps with the next different-track instance.** The SLEAP desktop version has more sophisticated track swapping options. The current implementation is confusing when there are more than 2 tracks.

118. **Navigation commands use `labels.find()` which may be O(n).** For large projects with thousands of labeled frames, sorting all frame indices on every navigation is expensive.

### Low

119. **Command names are PascalCase strings** but the undo label shows them unstyled (e.g., "Undo AddInstance" instead of "Undo Add Instance").

---

## Keyboard Shortcuts

**File:** `src/lib/shortcuts.ts`, `src/hooks/useKeyboardShortcuts.ts`

### High

120. [FIXED] **`goto frame` (Ctrl+J) uses `prompt()`.** Replaced with a proper `GoToFrameDialog.tsx` using shadcn/ui Dialog component.

121. **Many shortcuts defined in `DEFAULT_SHORTCUTS` are not bound.** Shortcuts like `delete track`, `learning`, `export clip`, `export_analysis_current`, `delete frame predictions`, `color predicted`, `show trails` have key bindings defined but no handler in `useKeyboardShortcuts`.

122. **Shortcuts are not configurable.** There is no UI for viewing or remapping shortcuts. SLEAP desktop allows shortcut customization. (Note: a Keyboard Shortcuts dialog now exists for viewing shortcuts, but not editing.)

123. **Space key for suggestions conflicts with text input.** If any input element is focused (e.g., the "Go to frame" prompt), pressing Space would navigate to the next suggestion instead of typing a space.

### Medium

124. **No `close` shortcut handler (Ctrl+Q).** Defined in shortcuts but not bound. Would call `window.close()` which does not work in browsers anyway.

125. **Arrow keys for frame navigation conflict when panels have focus.** If the user is navigating a list in a panel, arrow keys also change the video frame.

126. **No shortcut for toggling node names, color predicted, or non-visible nodes.** These are available in the View menu but not all have keyboard shortcuts.

### Low

127. [FIXED] **No visual keyboard shortcut overlay** (like pressing `?` in many apps to show all shortcuts). Keyboard Shortcuts dialog now available via Help menu.

---

## SkeletonRenderer

**File:** `src/canvas/SkeletonRenderer.ts`

### High

128. **`renderTrackLabel` uses fixed `"10px sans-serif"` font.** This does not scale with zoom, so at high zoom the label becomes tiny and at low zoom it becomes huge relative to the skeleton.

129. **`hitTestNode` threshold does not scale with zoom.** The threshold is passed as `markerSize * 2` from VideoPlayer but is in scene coordinates. At high zoom, this makes nodes very easy to accidentally click; at low zoom, they require pixel-perfect accuracy.

130. **`Math.min(...xs)` / `Math.max(...xs)` on large arrays.** For instances with hundreds of nodes (e.g., fly with 32 nodes x multiple instances), spreading into Math.min/max creates large argument lists. This is not a problem currently but could become one.

### Medium

131. **No anti-aliased rendering.** Canvas 2D uses default compositing which can produce jagged edges, especially for small circles at high DPI.

132. **Selection box uses `setLineDash` but does not reset globalAlpha.** If a previous draw call set globalAlpha, it would affect the selection box rendering. (Currently not an issue but fragile.)

133. **Non-visible nodes rendered at NaN coordinates.** If a node has `xy: [NaN, NaN]` and `visible: false`, and `showNonVisibleNodes` is true, `ctx.arc(NaN, NaN, ...)` is called which silently fails. No error, but the node is not rendered and may cause canvas state corruption.

### Low

134. **No hover/highlight effect on nodes.** In SLEAP desktop, hovering over a node highlights it before clicking. No hover feedback here.

---

## Platform Abstraction

**File:** `src/platform/index.ts`

### High

135. **`showSaveDialog` returns path from `showSaveFilePicker` but the File System Access API gives a FileSystemFileHandle, not a path string.** Line 94-97: `handle.name` returns only the filename, not the full path. This means the save location is lost.

136. **Web `readFile` throws unconditionally.** Any code path that calls `readFile` in browser mode gets an unhelpful error. There is no fallback.

### Medium

137. **`showOpenDialog` with `multiple: true` is defined in the interface but the browser implementation always returns a single File.** Callers expecting an array will get `null`.

138. **`createTauriPlatform` is async but `getPlatform()` caches the promise.** If called before Tauri plugins are ready, the dynamic imports could fail. No retry mechanism.

### Low

139. **`detectTauri()` is called twice** -- once for the async `getPlatform()` and once for the exported `isTauri` constant. Not a bug but redundant.

---

## File I/O

**File:** `src/hooks/useFileIO.ts`

### High

140. **Error state is never cleared on retry.** If a user gets an error, then tries again and succeeds, the error message from the first attempt persists until a re-mount (because `setError(null)` is at the top of `openProject` but not in the component lifecycle).
*Correction: `setError(null)` IS called at the start of `openProject`. However, `openFromDrop` also calls `setError(null)` at start, so this is fine.*

141. **No file size validation.** Users can attempt to load extremely large SLP files (1GB+) with no warning, potentially crashing the browser tab.

142. **`loadSlp` called with `{ openVideos: true }` which attempts to open video backends.** If the video files are not accessible from the browser (common for desktop-recorded SLP files), this silently fails with no user feedback about missing videos.

### Medium

143. **`openProject` returns void; the calling component has no way to know if loading succeeded.** The only feedback is the error state.

144. **`openFromDrop` duplicates most of the logic in `openProject`.** These should share a common `loadFile` helper to avoid drift.

---

## Test Coverage

**Files:** `tests/unit/*.ts`, `tests/unit/*.tsx`

### Critical

145. **No tests for VideoPlayer, Seekbar, ContextMenu, or SkeletonPanel.** These are the most complex interactive components.

146. **No tests for keyboard shortcuts.** The `useKeyboardShortcuts` hook is entirely untested.

147. **No tests for SkeletonRenderer.** Canvas rendering logic has zero test coverage.

### High

148. **Command tests do not test actual command implementations.** Only the `CommandContext` infrastructure is tested. None of `AddInstance`, `DeleteSelectedInstance`, `CopyInstance`, `PasteInstance`, navigation commands, or track commands have tests.

149. **Component tests are minimal.** Only render-without-crash and empty state checks. No interaction tests (click, drag, keyboard).

150. **No integration tests.** No tests verify the full flow of: open file -> navigate -> edit -> undo -> save.

### Medium

151. **`slpLoading.test.ts` loads fixture files in a `@vitest-environment node` context.** This does not test the browser code paths (File System Access API, drag-and-drop).

152. **No tests for the platform abstraction layer.** Both browser and Tauri implementations are untested.

---

## Cross-Cutting Concerns

### Critical

153. **No unsaved changes protection on tab close.** No `beforeunload` handler on the window. Closing the tab, refreshing, or navigating away with unsaved changes results in silent data loss. (Note: unsaved changes check on project open IS implemented, but not on tab close/refresh.)

154. [FIXED] **No toast/notification system.** Sonner toast library now integrated for success/error feedback on save, export, load, and delete operations.

### High

155. [FIXED] **No global loading/progress indicator.** Loading state now managed via store (`isLoading`/`loadingMessage`). Loading indicator shown during file load and WASM initialization.

156. **Accessibility is minimal.** No skip-to-content link, no ARIA landmarks on major sections, no screen reader announcements for state changes (instance selected, frame changed, etc.). Canvas-based rendering is inherently inaccessible with no text alternative.

157. **No responsive design for small screens.** The fixed side panel (10-40% of width) assumes a desktop-sized viewport. On tablets or small laptops, the video area becomes too small.

158. **No theme toggle.** The app uses dark mode (bg-background with dark defaults) but there is no way to switch to light mode.

### Medium

159. **No `beforeunload` handler when `hasChanges` is true.** Browser tab close/refresh should warn about unsaved data.

160. **Console is polluted with error logs.** Errors are logged via `console.error` throughout but never surfaced to the user. In production, these should be captured by an error reporting system.

161. **No performance monitoring.** Frame render times, canvas paint times, and file load times are not tracked. For large projects, performance could degrade significantly without any instrumentation.

162. [FIXED] **Multiple competing patterns for file loading.** All file loading now goes through consolidated `loadProjectFromFile()` / `loadProjectFromPath()` in `src/lib/loadProject.ts`.

### Low

163. **No right-to-left (RTL) language support.** All text is hardcoded left-to-right.

164. **No localization/i18n.** All strings are hardcoded in English.

165. **`video.shape` null handling is inconsistent.** Some places use `video.shape?.[0]`, others use `video?.shape?.[0]`, and some use `video.shape` without null checks.

---

## Summary by Severity

| Severity | Total | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 18    | 11    | 7         |
| High     | 43    | 11    | 32        |
| Medium   | 41    | 2     | 39        |
| Low      | 28    | 3     | 25        |
| **Total**| **130** | **27** | **103** |

### Top 10 Priority Fixes (Updated)

1. ~~Add `beforeunload` handler~~ Still needed for tab close protection (#153, #159)
2. ~~Add toast/notification system~~ [FIXED] (#154)
3. ~~Make node dragging undoable~~ [FIXED] (#36) ~~and node placement undoable~~ [FIXED] (#35)
4. **Fix ViewMenu reactivity** -- use proper subscriptions instead of `getState()` (#11)
5. **Fix EditMenu undo/redo label staleness** (#9)
6. ~~Add loading indicators~~ [FIXED] (#155) -- still need frame fetch indicator (#33)
7. ~~Implement stub buttons~~ Generate/Clear Suggestions [FIXED], Load Template [FIXED]. Add/Remove Videos still stubbed (#67).
8. ~~Add global Error Boundary~~ [FIXED] (#3)
9. ~~Fix `DeleteAllPredictions` undo~~ [FIXED] (#110)
10. ~~Add unsaved changes confirmation~~ [FIXED] for New Project (#114), Open Project (#2)
