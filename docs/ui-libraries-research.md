# UI Libraries Research for SLEAP Label Web

> **Status (March 2026):** Most library decisions have been made and implemented.
> Key adoptions: shadcn/ui (UI components + menubar), Zustand + immer (state),
> tinykeys (shortcuts), Tailwind CSS v4 (styling), raw Canvas 2D (rendering),
> react-resizable-panels (layout). dockview-react is a dependency but not yet wired up.

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

### Current implementation: react-resizable-panels + dockview (planned)

**react-resizable-panels** (`react-resizable-panels@^4.6.5`) is currently used for
the split-pane layout between the canvas and the side panel. The side panel uses
`Tabs` from shadcn/ui for Videos, Skeleton, Instances, and Suggestions panels.

**dockview-react** (`dockview-react@^5.0.0`) is installed as a dependency but not
yet wired up. It will be used when the full Qt-like docking experience (tabs,
drag-and-drop rearrangement, floating panels) is needed.

### Original recommendation: dockview

dockview remains the recommended choice for full docking because:

1. It provides the full Qt-like docking experience that react-resizable-panels cannot.
2. Zero dependencies keeps the bundle lean.
3. Active development (v5.0.0) with good momentum.
4. Layout serialization makes persisting user-customized layouts trivial.
5. TypeScript-first design.

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

### Decision: shadcn/ui Menubar (Radix-based) -- Adopted

The shadcn/ui Menubar built on Radix primitives was adopted in commit `dc11308`:
- Full desktop menu bar with File, Edit, Go, View, Labels, Tracks menus
- Checkable items, submenus, and shortcut display are built-in
- Implementation: `src/components/layout/MenuBar.tsx`
- Uses the unified `radix-ui` package (v1.4.3)

**Note on Radix maintenance**: The original Radix team has shifted focus to Base UI
(which reached v1.0 in December 2025). However, shadcn/ui now supports both Radix and
Base UI as component primitive sources. For the menubar specifically, Radix remains the
best option as Base UI does not yet offer a menubar primitive. The risk is manageable
since we own the component code via shadcn/ui's copy-paste model.

### Tauri Integration Note

When running as a Tauri app, native OS menus can replace or supplement the web menubar.
The web menubar is currently the primary implementation. Native Tauri menus are not yet
implemented.

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

### Decision: @tanstack/react-table -- Adopted

- **@tanstack/react-table** (`@tanstack/react-table@^8.21.0`) is used for the
  Instances panel and Videos panel. Styled with shadcn/ui Table components.
- **@tanstack/react-virtual** is not yet installed. Will be added when the Suggestions
  panel needs to handle large datasets (thousands of items).
- The Skeleton panel uses a custom list (small data size).

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

### Decision: shadcn/ui -- Adopted

shadcn/ui was adopted in commit `dc11308`. 19 shadcn/ui components are installed in
`src/components/ui/`:

badge, button, card, command, context-menu, dialog, dropdown-menu, input, menubar,
popover, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider,
table, tabs, tooltip.

Theme: oklch-based black/orange (zinc-950 bg, orange-500 primary), 13px base font
for information density. Configuration in `components.json`.

Additional UI deps: `lucide-react` (icons), `class-variance-authority`, `clsx`,
`tailwind-merge`, `sonner` (toasts), `cmdk` (command palette).

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

### Decision: Zustand -- Adopted

**Zustand** (`zustand@^5.0.3`) with `immer` (`immer@^10.1.1`) middleware is the
primary state management solution. The store is implemented at `src/stores/appStore.ts`.

**Zustand** was chosen because:

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

**Jotai** has not been needed. Zustand selectors provide sufficient re-render control.

### Store Structure (Implemented)

A single unified store at `src/stores/appStore.ts` covers all state domains:
- App-level: theme, layout, active tool, loading state
- Project data: labels, videos, skeletons, tracks, suggestions
- Canvas state: zoom, pan, selected instances/nodes
- Playback: current frame, playing, speed
- View settings: edge style, node size, color palette, color-by mode

The single-store approach was chosen over multiple stores for simplicity and to make
undo/redo (frame-level snapshots) easier to implement.

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

### Decision: tinykeys -- Adopted

`tinykeys@^3.0.0` is used as the keyboard shortcut foundation. 40+ keyboard
shortcuts are implemented, matching SLEAP's `shortcuts.yaml` bindings.

The command system at `src/commands/` uses `CommandContext` objects that bind
shortcuts to store actions. Shortcuts are registered via tinykeys in component
`useEffect` hooks and disabled when typing in input fields.

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

### Decision: Tailwind CSS v4 -- Adopted

Tailwind CSS v4 (`tailwindcss@^4.0.0`) is used with the `@tailwindcss/vite` plugin.
The theme uses oklch-based colors defined in `src/index.css` via CSS custom properties
(Tailwind v4's CSS-first configuration approach, no `tailwind.config.ts` needed).

Theme: dark mode (zinc-950 background), orange-500 primary accent.

---

## Summary of Decisions

| Category | Decision | Status | Package |
|----------|----------|--------|---------|
| Dockable Panels | dockview (planned), react-resizable-panels (current) | Partial | `dockview-react@^5.0.0`, `react-resizable-panels@^4.6.5` |
| Menu Bar | shadcn/ui Menubar (Radix-based) | Adopted | `radix-ui@^1.4.3` |
| Data Tables | @tanstack/react-table | Adopted | `@tanstack/react-table@^8.21.0` |
| UI Components | shadcn/ui (19 components) | Adopted | Copy-paste (not a dep) |
| State Management | Zustand + immer | Adopted | `zustand@^5.0.3`, `immer@^10.1.1` |
| Keyboard Shortcuts | tinykeys | Adopted | `tinykeys@^3.0.0` |
| CSS | Tailwind CSS v4 | Adopted | `tailwindcss@^4.0.0` |
| Canvas Rendering | Raw Canvas 2D | Adopted | None (built-in API) |
| Icons | Lucide React | Adopted | `lucide-react@^0.575.0` |
| Toasts | Sonner | Adopted | `sonner@^2.0.7` |
| Command Palette | cmdk | Adopted | `cmdk@^1.1.1` |

### Architecture (Implemented)

- **shadcn/ui** components styled with **Tailwind CSS v4**, built on **Radix** primitives
- **react-resizable-panels** handles the canvas/sidebar split; **Tabs** for panel switching
- **Zustand + immer** store drives all UI state; components subscribe to specific slices
- **tinykeys** shortcuts dispatch commands that update Zustand stores
- **@tanstack/react-table** powers the Instances and Videos panels
- **Raw Canvas 2D** for video frame rendering and skeleton overlay
- Testing: **vitest** (309+ unit tests) + **Playwright** (e2e, scaffolded)
- CI: `.github/workflows/test.yml` (tests) + `.github/workflows/build.yml` (Tauri builds)
