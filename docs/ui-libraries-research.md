# UI Libraries Research for SLEAP Label Web

Research into React/TypeScript UI libraries for building a desktop-quality annotation
tool, porting the Qt-based SLEAP GUI to the web.

---

## 1. Dockable Panels

The Qt SLEAP app has 4 dock widgets (Videos, Skeleton, Instances, Suggestions) that can
be resized, rearranged, and toggled. We need a React equivalent.

### Libraries Compared

| Library | Weekly Downloads | GitHub Stars | Last Updated | Dependencies |
|---------|-----------------|--------------|--------------|--------------|
| **react-resizable-panels** | ~180k | ~4.5k | Days ago (v4.6.5) | Zero |
| **flexlayout-react** | ~55k | ~1.3k | Active | React only |
| **dockview** | ~34k | ~3k | Days ago (v5.0.0) | Zero |
| **golden-layout** | ~12k | ~6.6k | Stale | jQuery-era |
| **rc-dock** | ~9.6k | ~800 | Sporadic | Several |

### Detailed Analysis

**react-resizable-panels** (by bvaughn, creator of react-virtualized/react-window):
- Excellent for split-pane resizable layouts with horizontal/vertical groups
- Built-in localStorage persistence; custom storage API available
- Collapsible panels with min/max constraints
- Nested panel groups for complex layouts
- Conditional panel rendering with layout persistence per combination
- **Limitation**: No drag-and-drop tab reordering. No floating panels. It is a
  split-pane library, not a docking library.

**dockview** (v5.0.0, actively maintained):
- Full IDE-like docking: tabs, groups, grids, splitviews
- Drag-and-drop tabs between groups
- Floating panels (detached, draggable)
- Popout windows (multi-monitor support)
- Layout serialization/deserialization (JSON)
- Custom tab rendering, headers, icons
- CSS-based theming
- Zero dependencies
- React, Vue, Angular, and vanilla TypeScript support
- Comprehensive API for programmatic control

**flexlayout-react** (highest downloads):
- Full docking with tabs, splitters, drag-and-drop
- Tab overflow handling (menu or scroll)
- Border tabsets (panels docked to edges)
- Popout tabs into new browser windows
- Submodels (layouts within layouts)
- Tab renaming (double-click)
- JSON model serialization (Model.fromJson / model.toJson)
- Light, gray, and dark themes built-in
- Only dependency is React

**rc-dock**:
- Full docking with drag-and-drop
- Floating panels
- Smaller community, less documentation
- Alpha version (v4.0.0-alpha.2) suggests API instability

**golden-layout**:
- Mature but aging; original architecture predates modern React
- React wrappers exist but feel bolted-on
- High star count reflects historical popularity, not current momentum

### Recommendation: dockview

**dockview** is the best fit for SLEAP Label Web because:

1. It provides the full Qt-like docking experience (tabs, drag-and-drop rearrangement,
   floating panels, toggle visibility) that react-resizable-panels cannot.
2. Zero dependencies keeps the bundle lean.
3. Active development (v5.0.0 released recently) with good momentum.
4. Layout serialization makes persisting user-customized layouts trivial.
5. The API is comprehensive and well-documented.
6. TypeScript-first design.

**Alternative**: flexlayout-react is a strong second choice with more downloads and
mature features like border tabsets and submodels. Consider it if dockview has
limitations in practice.

**Fallback strategy**: If full docking proves too complex for the initial release,
react-resizable-panels provides an excellent simpler split-pane layout that could be
upgraded later.

---

## 2. Menu Bar

The SLEAP app has a traditional desktop menu bar (File, Edit, View, Labels, Predict,
Help) with keyboard shortcuts, checkable items, and submenus.

### Options

**@radix-ui/react-menubar (via shadcn/ui)**:
- Purpose-built MenuBar primitive matching the desktop File/Edit/View pattern
- Full keyboard navigation (arrow keys, typeahead)
- WAI-ARIA compliant (Menu Button pattern, roving tabindex)
- Supports: items, labels, groups, separators
- Checkable items: `MenubarCheckboxItem` for toggles
- Radio groups: `MenubarRadioGroup` / `MenubarRadioItem` for single-select
- Submenus: `MenubarSub` / `MenubarSubTrigger` / `MenubarSubContent`
- Keyboard shortcut display: `MenubarShortcut` renders shortcut text (e.g., "Ctrl+S")
- shadcn/ui provides pre-styled, copy-paste components on top of Radix

**Custom implementation**:
- Full control but significant effort to match accessibility and keyboard nav
- Not recommended when Radix already solves this well

### Recommendation: shadcn/ui Menubar (Radix-based)

The shadcn/ui Menubar built on Radix primitives is the clear winner:
- It matches the exact desktop menu bar UX pattern we need
- Checkable items, submenus, and shortcut display are built-in
- Copy-paste ownership model means we can customize freely
- Tailwind styling integrates with the rest of the UI

**Note on Radix maintenance**: The original Radix team has shifted focus to Base UI
(which reached v1.0 in December 2025). However, shadcn/ui now supports both Radix and
Base UI as component primitive sources, and Radix has moved to a unified `radix-ui`
package. For the menubar specifically, Radix remains the best option as Base UI does not
yet offer a menubar primitive. The risk is manageable since we own the component code
via shadcn/ui's copy-paste model.

### Tauri Integration Note

When running as a Tauri app, native OS menus can replace or supplement the web menubar.
The web menubar should be the primary implementation, conditionally hidden when Tauri
native menus are active.

---

## 3. Data Tables

The SLEAP app has tables/lists for Videos, Instances, Suggestions, and Skeleton nodes.
These need to display tabular data, support selection, and potentially handle large
datasets (thousands of suggestions).

### Options

**@tanstack/react-table (v8)**:
- Headless: provides logic (sorting, filtering, selection, pagination) with no UI
- Lightweight: ~10-15kb with tree-shaking
- Full TypeScript support
- Works with any UI/styling approach
- Pairs with @tanstack/react-virtual for virtualization
- Very widely adopted (~3M weekly downloads)

**ag-grid**:
- Full-featured component-based grid ("gold standard")
- Built-in virtualization, filtering, sorting, grouping, pivoting
- Much heavier bundle; commercial license for advanced features
- Overkill for our use case (simple lists, not spreadsheets)

**Simple custom tables**:
- For small datasets (<100 rows), plain HTML tables with React state are sufficient
- Videos list and skeleton nodes will rarely exceed a few dozen items

**@tanstack/react-virtual (for large lists)**:
- ~10-15kb, headless virtualization
- Renders only visible items + small buffer
- Handles 1M+ items efficiently
- Supports vertical, horizontal, and grid virtualization
- Variable row heights and dynamic measurement

### Recommendation: @tanstack/react-table + @tanstack/react-virtual

- Use **@tanstack/react-table** for structured tabular data (Videos, Instances) where
  sorting, selection, and column management are needed.
- Use **@tanstack/react-virtual** for the Suggestions panel, which may have thousands
  of items requiring virtualization.
- For the Skeleton panel (node/edge list), a simple custom list is sufficient given the
  small data size.
- Style tables with shadcn/ui's Table components for visual consistency.

---

## 4. UI Component Library

### Options Compared

**shadcn/ui**:
- Copy-paste components (you own the code, no node_modules dependency)
- Built on Radix UI primitives (accessible, keyboard-navigable)
- Styled with Tailwind CSS
- 100k+ GitHub stars; adopted by Vercel, many production apps
- CLI for adding components: `npx shadcn add button dialog tooltip`
- Full customization since code lives in your project
- Now supports both Radix and Base UI as primitive sources
- Components include: Button, Dialog, DropdownMenu, Menubar, Tooltip, Select,
  Popover, Tabs, ScrollArea, Slider, Switch, and many more

**Radix UI (standalone)**:
- Unstyled accessible primitives
- Excellent accessibility (ARIA, keyboard nav)
- Maintenance has slowed; original team moved to Base UI
- Using via shadcn/ui is preferred over direct usage

**Headless UI (by Tailwind Labs)**:
- Smaller component set than Radix
- Tight Tailwind integration
- Less comprehensive than Radix for our desktop-app needs

**Pure custom CSS**:
- Maximum control but enormous effort
- Accessibility would need to be implemented from scratch
- Not justified when shadcn/ui provides owned, customizable components

### Recommendation: shadcn/ui

shadcn/ui is the clear choice:

1. **Ownership model**: Components are copied into your project. No version lock-in,
   no breaking upstream changes. You can modify any component freely.
2. **Accessibility**: Built on Radix primitives with full ARIA and keyboard support.
3. **Tailwind native**: Consistent with our CSS approach (see section 7).
4. **Comprehensive**: Covers buttons, dialogs, dropdowns, menus, tooltips, tabs,
   sliders, and more -- everything a desktop-like app needs.
5. **Active ecosystem**: Huge community, regular updates, extensive examples.
6. **Desktop-ready components**: Menubar, Command palette (Cmd+K), Context menus,
   and keyboard shortcut display are all available.

---

## 5. State Management

The SLEAP Qt app uses a `GuiState` pattern where state properties have change callbacks,
and various UI components subscribe to state changes. We need a React equivalent.

### Options Compared

| Feature | Zustand | Jotai |
|---------|---------|-------|
| Architecture | Centralized store | Atomic (individual atoms) |
| Bundle size | ~1.2kb gzipped | ~2.1kb gzipped |
| Boilerplate | Minimal | Minimal |
| Provider needed | No | Yes (but optional) |
| React devtools | Via middleware | Via devtools package |
| Middleware | persist, devtools, immer, subscribeWithSelector | Built-in derived atoms |
| Outside React | Full access (getState, setState, subscribe) | Possible but less ergonomic |
| TypeScript | Excellent | Excellent |
| Re-render control | Selectors | Automatic (atom-level) |

### Zustand Key Features for Our Use Case

- **`subscribeWithSelector` middleware**: Subscribe to specific state slices with
  equality checking -- mirrors SLEAP's GuiState callback pattern exactly.
  ```ts
  const unsub = useStore.subscribe(
    state => state.currentFrame,
    (frame, prevFrame) => { /* callback on change */ }
  )
  ```
- **`persist` middleware**: Automatically persist state to localStorage/sessionStorage
- **`immer` middleware**: Immutable updates with mutable syntax for complex nested state
- **Outside React access**: `useStore.getState()` and `useStore.setState()` work
  anywhere -- useful for command system, keyboard shortcuts, Tauri IPC handlers
- **Store slicing**: Split large stores into domain-specific slices that compose together
- **No provider wrapping**: Stores are importable modules, no context hierarchy needed

### Jotai Key Features

- **Fine-grained reactivity**: Each atom independently triggers re-renders only in
  components that read it -- optimal for performance-critical UIs
- **Derived atoms**: Computed values that automatically update when dependencies change
- **Atom-in-atom**: Atoms can hold references to other atoms for dynamic state graphs
- **Better for**: Highly interconnected, frequently-changing state where minimal
  re-renders are critical

### Recommendation: Zustand (primary) + Jotai (optional, targeted)

**Zustand** is the primary recommendation because:

1. **GuiState mapping**: The `subscribeWithSelector` middleware directly maps to SLEAP's
   pattern of subscribing to state property changes.
2. **Outside React**: The command system, keyboard shortcuts, and Tauri IPC handlers
   need to read/write state outside the React component tree. Zustand makes this trivial.
3. **Store organization**: Domain-specific stores (AppStore, ProjectStore, CanvasStore)
   are natural and composable.
4. **Persistence**: Built-in persist middleware for saving user preferences and layout.
5. **Simplicity**: Almost no boilerplate. Define state + actions in one place.
6. **Ecosystem**: 50k+ GitHub stars, by the pmndrs team (also behind react-three-fiber,
   drei, jotai, valtio).

**Jotai** can be used alongside Zustand for specific hot-path UI state where
atom-level reactivity prevents unnecessary re-renders (e.g., per-instance visibility
toggles in the canvas).

### Proposed Store Structure

```
stores/
  appStore.ts        # App-level state: theme, layout, active tool
  projectStore.ts    # Project data: videos, labels, skeletons
  canvasStore.ts     # Canvas state: zoom, pan, selected instances
  playerStore.ts     # Playback state: current frame, playing, speed
```

---

## 6. Keyboard Shortcuts

SLEAP has extensive keyboard shortcuts defined in `shortcuts.yaml`, supporting
customization. The web app needs a robust shortcut system.

### Libraries Compared

| Library | Size | Key Detection | Weekly Downloads | Maintained |
|---------|------|---------------|-----------------|------------|
| **tinykeys** | ~650B | `key` (correct) | ~49k | Yes |
| **mousetrap** | ~3kb | `which` (deprecated) | ~542k | Stale |
| **hotkeys-js** | ~3kb | `keyCode` (deprecated) | ~500k | Yes |
| **react-hotkeys** | ~12kb | Mixed | ~232k | Stale |

### Critical Technical Issue

Per [Jack Duvall's analysis](https://blog.duvallj.pw/posts/2025-01-10-all-javascript-keyboard-shortcut-libraries-are-broken.html),
most keyboard shortcut libraries are fundamentally broken:

- **Mousetrap** uses `which` (deprecated, unreliable across keyboards)
- **hotkeys-js** uses `keyCode` (deprecated, tied to physical key positions)
- Both break on international/alternative keyboard layouts

**tinykeys** is the only library that defaults to the modern `key` property while also
supporting `code` for physical key matching when explicitly requested.

### Recommendation: Custom hook built on tinykeys patterns

Given the need for customizable shortcuts (like SLEAP's shortcuts.yaml):

1. **Use tinykeys as the foundation** for its correct `key`-based detection and tiny
   size (~650 bytes).
2. **Build a custom `useShortcuts` hook** that:
   - Reads shortcut mappings from a configuration store (Zustand)
   - Maps shortcut keys to command IDs (ties into the command system)
   - Supports context-aware shortcuts (different shortcuts when canvas is focused vs.
     a panel)
   - Handles modifier keys correctly (Ctrl/Cmd normalization for cross-platform)
   - Disables shortcuts when typing in input fields
3. **Configuration format**: JSON/YAML mapping of command IDs to key combinations,
   stored in Zustand with persist middleware for user customization.

### Proposed Architecture

```ts
// shortcuts.ts
const defaultShortcuts: Record<string, string[]> = {
  "video.nextFrame": ["ArrowRight"],
  "video.prevFrame": ["ArrowLeft"],
  "video.play": ["Space"],
  "labels.newInstance": ["Control+i"],
  "labels.deleteInstance": ["Delete"],
  "file.save": ["Control+s"],
  // ...
};

// useShortcuts hook binds these to the command system via tinykeys
```

---

## 7. CSS Approach

### Options Compared

**Tailwind CSS**:
- Utility-first: styles composed via class names in JSX
- No runtime overhead (compiled at build time)
- Consistent design tokens (spacing, colors, typography)
- Excellent DX with VS Code IntelliSense
- Required by shadcn/ui
- Highly customizable via tailwind.config
- Great for precise desktop-like layouts (flex, grid, exact spacing)

**CSS Modules**:
- Scoped class names (no conflicts)
- Write traditional CSS
- Good IDE support
- No utility class learning curve
- No design token system built-in

**styled-components / CSS-in-JS**:
- Runtime overhead (style injection)
- Falling out of favor in 2025-2026
- Not compatible with shadcn/ui
- Poor performance for large component trees

### Recommendation: Tailwind CSS

Tailwind CSS is the clear choice because:

1. **Required by shadcn/ui**: Our component library choice mandates Tailwind.
2. **Desktop precision**: Tailwind's utility classes enable exact pixel-level control
   needed for desktop-like layouts (precise padding, spacing, sizing).
3. **No runtime overhead**: Styles are compiled ahead of time. Critical for a
   performance-sensitive annotation tool.
4. **Design consistency**: Built-in design tokens ensure consistent spacing, colors,
   and typography across the entire app.
5. **Dark mode**: Built-in dark mode support via `dark:` variant, matching SLEAP's
   dark theme.
6. **Custom properties**: We can define app-specific design tokens in tailwind.config
   for panel backgrounds, border colors, canvas overlays, etc.

### Tailwind Configuration Strategy

```ts
// tailwind.config.ts
export default {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // App-specific semantic colors
        panel: { bg: "...", border: "...", header: "..." },
        canvas: { bg: "...", overlay: "..." },
        skeleton: { node: "...", edge: "..." },
      },
    },
  },
};
```

---

## Summary of Recommendations

| Category | Recommendation | Alternatives |
|----------|---------------|--------------|
| Dockable Panels | **dockview** | flexlayout-react, react-resizable-panels (simpler) |
| Menu Bar | **shadcn/ui Menubar** (Radix-based) | Custom (not recommended) |
| Data Tables | **@tanstack/react-table** + **@tanstack/react-virtual** | Simple custom tables for small lists |
| UI Components | **shadcn/ui** | Radix directly, Headless UI |
| State Management | **Zustand** (primary) | Jotai (targeted use alongside Zustand) |
| Keyboard Shortcuts | **tinykeys** + custom hook | Custom from scratch |
| CSS | **Tailwind CSS** | CSS Modules (as supplement if needed) |

### Key Package List

```
# Core UI
dockview-react           # Docking panel layout
shadcn/ui                # UI components (copy-paste, not a dependency)
tailwindcss              # Utility-first CSS

# State & Logic
zustand                  # State management
@tanstack/react-table    # Headless table logic
@tanstack/react-virtual  # List/table virtualization
tinykeys                 # Keyboard shortcut detection

# Radix primitives (via shadcn/ui)
radix-ui                 # Unified Radix package for accessible primitives
```

### Architecture Alignment

These choices work together cohesively:
- **shadcn/ui** components are styled with **Tailwind CSS** and built on **Radix**
  primitives
- **dockview** handles the overall layout; each dock panel renders shadcn/ui components
- **Zustand** stores drive all UI state; components subscribe to specific slices
- **tinykeys** shortcuts dispatch commands that update Zustand stores
- **@tanstack/react-table** powers data panels (Videos, Instances, Suggestions)
  styled with shadcn/ui Table components
- The entire stack is TypeScript-first with zero/minimal runtime overhead
