# Desktop Shell Research: Tauri v2 and Alternatives

## Executive Summary

**Recommendation: Tauri v2** is the best choice for SLEAP's desktop shell. It provides native file system access, tiny bundle sizes (~8 MB vs ~244 MB for Electron), low memory footprint, native menus, sidecar support for Python ML inference, and uses the same web frontend code that can also run standalone in a browser.

For the **web-only fallback path**, the File System Access API is viable in Chromium browsers but has critical limitations (no Firefox/Safari support for full API, no persistent permissions). The recommended architecture is to build the frontend as a standard React SPA that works in both contexts, with an abstraction layer that routes file I/O through Tauri APIs when running in the desktop shell and through browser APIs when running standalone.

---

## 1. Tauri v2 Overview

Tauri is a framework for building cross-platform desktop (and mobile) applications using web technologies for the frontend and Rust for the backend. Unlike Electron, Tauri does not bundle Chromium or Node.js. Instead, it uses the OS-native WebView:

| Platform | WebView Engine | Based On |
|----------|---------------|----------|
| Windows | WebView2 | Chromium (Edge) |
| macOS | WKWebView | WebKit (Safari) |
| Linux | WebKit2GTK | WebKit |

Key characteristics:
- Frontend is standard HTML/CSS/JS rendered in the native webview
- Backend is Rust, compiled to a native binary
- IPC between frontend and backend via `invoke()` commands and events
- Permissions-based security model (capabilities, scopes)
- Plugin ecosystem for file system, dialogs, shell, etc.

Reference: [Tauri v2 docs](https://v2.tauri.app/)

---

## 2. Project Setup: Tauri v2 + Vite + React + TypeScript

### Scaffolding

```bash
# Option 1: Official create-tauri-app
sh <(curl https://create.tauri.app/sh)
# Select: TypeScript, npm/pnpm, React, TypeScript

# Option 2: Manual setup
npm create vite@latest sleap-label -- --template react-ts
cd sleap-label
npm install
npm install -D @tauri-apps/cli@latest
npx tauri init
```

### Project Structure

```
sleap-label/
  src/                    # React frontend (Vite)
    App.tsx
    main.tsx
  src-tauri/              # Rust backend
    src/
      main.rs             # Tauri entry point, command handlers
      lib.rs
    Cargo.toml
    tauri.conf.json        # App config (window, bundle, plugins)
    capabilities/
      default.json         # Permission declarations
  package.json
  vite.config.ts
```

### Development Workflow

```bash
npm run tauri dev     # Starts Vite dev server + compiles Rust + opens native window
npm run tauri build   # Builds production bundle with native installer
```

The initial Rust compilation takes ~80s but subsequent incremental builds are fast. The Vite dev server provides HMR for the frontend as usual.

### Key Config (tauri.conf.json)

```json
{
  "productName": "SLEAP Label",
  "version": "0.1.0",
  "identifier": "org.sleap.label",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "SLEAP Label",
        "width": 1280,
        "height": 800,
        "resizable": true
      }
    ]
  }
}
```

---

## 3. File System Access

### Tauri Plugin: @tauri-apps/plugin-fs

Provides full read/write access to the local file system from the frontend.

**Installation:**
```bash
npm install @tauri-apps/plugin-fs
cargo add tauri-plugin-fs -F tauri-plugin-fs/protocol-asset
```

**Register in Rust (main.rs):**
```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Frontend usage:**
```typescript
import { readFile, writeFile, open, BaseDirectory } from '@tauri-apps/plugin-fs';

// Read binary file (e.g., .slp HDF5 file)
const bytes: Uint8Array = await readFile('/path/to/labels.slp');

// Write binary file
await writeFile('/path/to/labels.slp', bytes);

// Stream-style file I/O
const file = await open('/path/to/large-file.slp', { read: true });
// ... read in chunks
await file.close();
```

**Permissions (capabilities/default.json):**
```json
{
  "permissions": [
    "fs:default",
    {
      "identifier": "fs:allow-read",
      "allow": [{ "path": "**" }]
    },
    {
      "identifier": "fs:allow-write",
      "allow": [{ "path": "**" }]
    }
  ]
}
```

### Custom Rust Commands for HDF5

For heavy file I/O (like reading HDF5 files), we can implement Rust commands that use the `hdf5` crate:

```rust
#[tauri::command]
async fn read_slp_file(path: String) -> Result<SomeData, String> {
    // Use hdf5-rust crate for native HDF5 reading
    // Return parsed data to frontend
}
```

This is faster than reading bytes in JS and parsing with h5wasm, especially for large files.

---

## 4. File Dialog

### Tauri Plugin: @tauri-apps/plugin-dialog

**Installation:**
```bash
npm install @tauri-apps/plugin-dialog
```

**Frontend usage:**
```typescript
import { open, save } from '@tauri-apps/plugin-dialog';

// Open file dialog
const selected = await open({
  multiple: false,
  filters: [{
    name: 'SLEAP Labels',
    extensions: ['slp']
  }, {
    name: 'Video Files',
    extensions: ['mp4', 'avi', 'h264']
  }]
});

if (selected) {
  // selected is a string file path
  console.log('Selected:', selected);
}

// Save dialog
const savePath = await save({
  filters: [{ name: 'SLEAP Labels', extensions: ['slp'] }]
});
```

---

## 5. IPC: Frontend-Backend Communication

### Commands (invoke)

The primary IPC mechanism. Frontend calls Rust functions, gets typed responses.

**Rust side:**
```rust
#[tauri::command]
fn greet(name: String) -> String {
    format!("Hello, {}!", name)
}

// Async commands (don't block the main thread)
#[tauri::command]
async fn load_labels(path: String) -> Result<LabelsData, String> {
    // Heavy I/O here
    Ok(data)
}

// Register:
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![greet, load_labels])
```

**Frontend side:**
```typescript
import { invoke } from '@tauri-apps/api/core';

const greeting: string = await invoke('greet', { name: 'SLEAP' });
const data: LabelsData = await invoke('load_labels', { path: '/path/to/file.slp' });
```

### Events (pub/sub)

For streaming data, progress updates, or backend-initiated notifications.

**Rust to Frontend:**
```rust
app.emit("progress", ProgressPayload { percent: 50 })?;
```

**Frontend listening:**
```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen('progress', (event) => {
  console.log('Progress:', event.payload.percent);
});
```

### Channels (streaming)

For high-throughput data like video frames or inference results:

```rust
#[tauri::command]
fn stream_frames(channel: tauri::ipc::Channel<FrameData>) {
    for frame in frames {
        channel.send(frame).unwrap();
    }
}
```

### IPC Summary for SLEAP

| Use Case | Mechanism |
|----------|-----------|
| Load/save .slp files | `invoke()` command |
| Open/save dialogs | Dialog plugin |
| ML inference progress | Events |
| Video frame streaming | Channels |
| Menu actions | Events from Rust menu handlers |

---

## 6. Sidecar Support: Python for ML Inference

Tauri supports embedding external binaries ("sidecars") that ship with the app.

### Approach: PyInstaller + Tauri Sidecar

1. **Bundle Python with PyInstaller:**
   ```bash
   pyinstaller --onedir inference_server.py
   ```
   This creates a standalone binary with embedded Python runtime.

2. **Configure in tauri.conf.json:**
   ```json
   {
     "bundle": {
       "externalBin": ["binaries/inference-server"]
     }
   }
   ```

3. **Platform naming convention:**
   Binary must have target-triple suffix:
   - `inference-server-x86_64-unknown-linux-gnu`
   - `inference-server-x86_64-pc-windows-msvc.exe`
   - `inference-server-aarch64-apple-darwin`

4. **Launch from frontend:**
   ```typescript
   import { Command } from '@tauri-apps/plugin-shell';

   const command = Command.sidecar('binaries/inference-server');
   command.on('close', (data) => console.log('Exited:', data.code));
   command.stdout.on('data', (line) => console.log('stdout:', line));
   const child = await command.spawn();
   ```

5. **Communication:** The sidecar can run an HTTP server (e.g., FastAPI on localhost) or communicate via stdin/stdout. The FastAPI approach is recommended for structured request/response patterns.

### Known Issues
- PyInstaller single-file mode (`--onefile`) can cause issues with process cleanup on app exit. Use `--onedir` mode instead.
- Sidecar binaries increase the total bundle size significantly (Python runtime alone is ~30-50 MB).
- The sidecar process lifecycle must be managed carefully (start on demand, kill on app exit).

### Alternative: Rust-Native ML
For maximum performance and minimal bundle size, critical inference code could eventually be ported to Rust using `tch-rs` (PyTorch bindings) or `onnxruntime-rs`. This eliminates the Python sidecar entirely but is a larger engineering effort.

---

## 7. Window Customization

### Native Menus

Tauri v2 supports fully native application menus with keyboard accelerators:

```rust
use tauri::menu::{MenuBuilder, SubmenuBuilder, MenuItemBuilder};

let file_menu = SubmenuBuilder::new(app, "File")
    .text("open", "Open...")
    .text("save", "Save")
    .text("save-as", "Save As...")
    .separator()
    .quit()
    .build()?;

let edit_menu = SubmenuBuilder::new(app, "Edit")
    .undo()
    .redo()
    .separator()
    .copy()
    .cut()
    .paste()
    .build()?;

let menu = MenuBuilder::new(app)
    .items(&[&file_menu, &edit_menu])
    .build()?;

app.set_menu(menu)?;
```

**JavaScript menu construction** is also supported:

```typescript
import { Menu, Submenu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';

const fileMenu = await Submenu.new({
  text: 'File',
  items: [
    await MenuItem.new({ text: 'Open...', accelerator: 'CmdOrCtrl+O', action: () => openFile() }),
    await MenuItem.new({ text: 'Save', accelerator: 'CmdOrCtrl+S', action: () => saveFile() }),
  ]
});
```

### Keyboard Shortcuts

Accelerators use platform-aware syntax: `CmdOrCtrl+S`, `CmdOrCtrl+Shift+Z`, etc. These map to Cmd on macOS and Ctrl on Windows/Linux.

### Multi-Window

Tauri v2 supports multiple windows and webviews:

```typescript
import { Window } from '@tauri-apps/api/window';
import { Webview } from '@tauri-apps/api/webview';

const newWindow = new Window('settings', {
  title: 'Settings',
  width: 600,
  height: 400
});
```

### Custom Titlebar

For a more custom look, disable native decorations and implement a custom titlebar:
- Set `"decorations": false` in config
- Use `data-tauri-drag-region` attribute for drag areas
- Implement minimize/maximize/close buttons manually

---

## 8. WebView Performance for Canvas/WebGL

### Platform WebView Capabilities

| Platform | Engine | Canvas 2D | WebGL 2 | WebGPU | HW Accel |
|----------|--------|-----------|---------|--------|----------|
| Windows | WebView2/Chromium | Yes | Yes | Yes* | Yes |
| macOS | WebKit | Yes | Yes | Yes* | Yes |
| Linux | WebKit2GTK | Yes | Yes | No | Varies |

*WebGPU support depends on OS/driver version.

### Performance Considerations

- **Windows (WebView2):** Best Canvas/WebGL performance. WebView2 uses Chromium's GPU-accelerated compositor. Hardware acceleration is enabled by default.
- **macOS (WebKit):** Good performance. WebKit has solid Canvas 2D and WebGL support. Some WebGL extensions may differ from Chromium.
- **Linux (WebKit2GTK):** Most variable. Hardware acceleration depends on the distro, GPU drivers, and WebKit2GTK version. Some users report WebGL performance issues.

### Known Issues

- There are [reported WebGL lag issues on Windows](https://github.com/tauri-apps/tauri/issues/8020) in some configurations.
- WebGL in Tauri uses the same rendering pipeline as the browser -- performance should be comparable to running the same code in the native browser.
- For 60fps Canvas 2D rendering (our primary use case with video frames + skeleton overlays), performance should be excellent on all platforms since Canvas 2D is well-optimized in all modern WebView engines.

### Recommendations for SLEAP

1. Use **Canvas 2D** for the primary rendering path (video frames + skeleton overlays). This is well-supported across all platforms.
2. Consider **WebGL** only if Canvas 2D becomes a bottleneck (e.g., rendering many skeleton instances simultaneously).
3. Avoid WebGPU for now due to inconsistent support across WebView engines.
4. Test early on Linux with WebKit2GTK to catch any performance issues.

---

## 9. Build and Distribution

### Cross-Platform Builds

```bash
npm run tauri build
```

Produces platform-native installers:

| Platform | Formats |
|----------|---------|
| Windows | .msi, .exe (NSIS) |
| macOS | .dmg, .app bundle |
| Linux | .deb, .rpm, .AppImage |

### Bundle Size Comparison

| Metric | Tauri v2 | Electron |
|--------|----------|----------|
| Installer size | ~8 MB | ~244 MB |
| Memory (idle) | ~30-50 MB | ~150-300 MB |
| Memory (6 windows) | ~172 MB | ~409 MB |
| Startup time | <500 ms | 1-2 s |
| Includes runtime | No (uses OS WebView) | Yes (Chromium + Node.js) |

### CI/CD

Tauri provides GitHub Actions for cross-platform CI:

```yaml
- uses: tauri-apps/tauri-action@v0
  with:
    tagName: v__VERSION__
    releaseName: 'SLEAP Label v__VERSION__'
```

### Code Signing

Tauri supports code signing on all platforms:
- **Windows:** Authenticode certificates
- **macOS:** Apple Developer certificates + notarization
- **Linux:** GPG signing for .deb/.rpm

---

## 10. Tauri vs Electron Comparison

| Feature | Tauri v2 | Electron |
|---------|----------|----------|
| Language | Rust backend | Node.js backend |
| WebView | OS native | Bundled Chromium |
| Bundle size | ~8 MB | ~244 MB |
| Memory usage | ~50 MB | ~200 MB |
| Startup time | <500 ms | 1-2 s |
| Rendering consistency | Varies by OS | Identical everywhere |
| Canvas/WebGL | Good (platform-dependent) | Excellent (Chromium) |
| File system | Plugin-based | Node.js fs module |
| Native menus | Yes (Rust or JS) | Yes (JS) |
| Python sidecar | Yes (externalBin) | Yes (child_process) |
| Security model | Capabilities/permissions | Sandbox/preload |
| Update mechanism | Plugin available | Built-in autoUpdater |
| Mobile support | Yes (iOS/Android) | No |
| Maturity | v2 stable (2024) | Very mature (~2013) |
| Ecosystem | Growing | Very large |

### Why Tauri over Electron for SLEAP

1. **Bundle size:** Scientific apps should be lean. 8 MB vs 244 MB is significant, especially when adding a Python sidecar.
2. **Memory:** SLEAP loads large video files and annotation data. Lower base memory means more headroom.
3. **Security:** Tauri's capability-based permissions are better suited for a file-editing app.
4. **Rust backend:** Can use `hdf5` crate for native HDF5 reading, potentially faster than JS-based solutions.
5. **Mobile future:** Tauri supports iOS/Android, which could be useful for data collection.

### Risks of Tauri

1. **WebView inconsistency:** The app may render/behave slightly differently on macOS (WebKit) vs Windows (Chromium) vs Linux (WebKit2GTK). Requires cross-platform testing.
2. **Linux WebKit2GTK:** Oldest/least capable WebView. Some CSS/JS features may be missing. WebGL performance can vary.
3. **Smaller ecosystem:** Fewer ready-made packages compared to Electron.
4. **Rust learning curve:** Backend code requires Rust knowledge.
5. **Build times:** Initial Rust compilation is slow (~80s), though incremental builds are fast.

---

## 11. Path to Web-Only Mode

A key requirement is that the same frontend code should also run as a standalone web app (no desktop shell). Here is the evaluation of this path.

### Architecture: Abstraction Layer

```typescript
// src/platform/index.ts
export interface PlatformAPI {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  showOpenDialog(options: OpenDialogOptions): Promise<string | null>;
  showSaveDialog(options: SaveDialogOptions): Promise<string | null>;
}

// src/platform/tauri.ts -- used when window.__TAURI__ is defined
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';
export const tauriPlatform: PlatformAPI = { readFile, writeFile, ... };

// src/platform/web.ts -- used in standalone browser mode
export const webPlatform: PlatformAPI = { /* File System Access API or fallback */ };

// Runtime detection
export const platform: PlatformAPI =
  window.__TAURI__ ? tauriPlatform : webPlatform;
```

### File System Access API (Browser)

The [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) allows web apps to read/write local files with user consent.

**Capabilities:**
- `showOpenFilePicker()` -- file open dialog
- `showSaveFilePicker()` -- save dialog
- `FileSystemWritableFileStream` -- write to files
- Supports binary data (ArrayBuffer, Blob)
- Supports streaming for large files

**Browser Support (as of early 2026):**

| Browser | Support |
|---------|---------|
| Chrome 86+ | Full |
| Edge 86+ | Full |
| Opera 91+ | Full |
| Firefox | **Not supported** (position: "harmful") |
| Safari | **Not supported** (only Origin Private File System) |
| Mobile browsers | Not supported |

**Global usage: ~34%** (Chromium-only)

**Limitations:**
- Requires HTTPS and user gesture (click)
- Permissions not always persisted between sessions
- No Firefox or Safari support for the `showOpenFilePicker`/`showSaveFilePicker` APIs
- Fallback for unsupported browsers: `<input type="file">` for open, download link for save

### HDF5 in the Browser

For the web-only path, reading .slp (HDF5) files requires a JavaScript HDF5 library:

| Library | Read | Write | Size | Notes |
|---------|------|-------|------|-------|
| [h5wasm](https://github.com/usnistgov/h5wasm) | Yes | Yes | ~3.2 MB (ESM+WASM) | Full-featured, WASM-based, supports compression |
| [jsfive](https://github.com/usnistgov/jsfive) | Yes | No | Tiny | Pure JS, limited datatype support |

**h5wasm** is the recommended choice:
- Read/write support
- Efficient slicing (dataset subset reads via libhdf5)
- Compression support (gzip)
- TypedArray output (efficient for binary data)
- Works in browser and Node.js

**Current limitation:** h5wasm requires loading the entire file into an ArrayBuffer. HTTP range request support (partial reads from remote URLs) is planned but not yet implemented. For the web-only path, users would need to open local files via the File System Access API or upload them.

### Web-Only Path Summary

| Feature | Tauri Desktop | Web-Only (Chromium) | Web-Only (Firefox/Safari) |
|---------|--------------|--------------------|--------------------------|
| File open dialog | Native | File System Access API | `<input type="file">` |
| File save | Native | File System Access API | Download link |
| Read/write HDF5 | Rust hdf5 crate or h5wasm | h5wasm | h5wasm |
| Video playback | `<video>` + Canvas | `<video>` + Canvas | `<video>` + Canvas |
| Keyboard shortcuts | Native menus + web | Web only | Web only |
| Python inference | Sidecar | Not available | Not available |
| Performance | Best | Good | Good |

The web-only path is viable for **viewing and basic editing** in Chromium browsers. Full functionality (ML inference, native menus, reliable file save) requires the Tauri desktop shell.

---

## 12. Recommended Architecture

```
sleap-label-web/
  src/                          # Shared React frontend
    components/                 # UI components (Canvas, panels, menus)
    platform/                   # Platform abstraction layer
      index.ts                  # Runtime detection + API interface
      tauri.ts                  # Tauri implementation
      web.ts                    # Browser implementation
    hooks/                      # React hooks
    stores/                     # Zustand state management
    App.tsx
    main.tsx
  src-tauri/                    # Tauri/Rust backend
    src/
      main.rs                   # Entry point, menu setup
      commands/                 # IPC command handlers
        file_io.rs              # HDF5 read/write
        inference.rs            # Sidecar management
    Cargo.toml
    tauri.conf.json
  public/                       # Static assets
  vite.config.ts
  package.json
```

### Key Design Principles

1. **Platform abstraction:** All platform-specific code goes through the `platform/` abstraction layer. Components never import Tauri APIs directly.
2. **Shared rendering:** Canvas rendering code is 100% shared. It uses standard Canvas 2D API.
3. **Graceful degradation:** When running in browser-only mode, features that require the desktop shell (e.g., inference, native menus) are hidden or show informational messages.
4. **Tauri detection:** Use `window.__TAURI__` to detect if running inside Tauri at runtime.

---

## 13. Getting Started Checklist

1. Install prerequisites: Rust toolchain, Node.js, platform-specific deps
2. Scaffold project: `npm create vite@latest` + `npx tauri init`
3. Install plugins: `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-shell`
4. Set up capabilities/permissions in `src-tauri/capabilities/default.json`
5. Implement platform abstraction layer
6. Build Canvas rendering engine (shared)
7. Implement file I/O commands (Rust) and connect to frontend
8. Set up native menus with keyboard shortcuts
9. Test on all three platforms (especially Linux/WebKit2GTK)
10. Later: Add Python sidecar for ML inference

---

## References

- [Tauri v2 Documentation](https://v2.tauri.app/)
- [Tauri v2 Create Project](https://v2.tauri.app/start/create-project)
- [Tauri v2 File System Plugin](https://v2.tauri.app/plugin/file-system)
- [Tauri v2 Dialog Plugin](https://v2.tauri.app/plugin/dialog)
- [Tauri v2 Calling Rust from Frontend](https://v2.tauri.app/develop/calling-rust)
- [Tauri v2 Sidecar / External Binaries](https://v2.tauri.app/develop/sidecar)
- [Tauri v2 Window Customization](https://v2.tauri.app/learn/window-customization)
- [Tauri v2 Window Menu](https://v2.tauri.app/learn/window-menu)
- [Tauri v2 WebView Versions](https://v2.tauri.app/reference/webview-versions/)
- [Tauri v2 App Size](https://v2.tauri.app/concept/size)
- [Tauri vs Electron Comparison](https://www.gethopp.app/blog/tauri-vs-electron)
- [File System Access API (Chrome)](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [File System Access API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
- [File System Access API Browser Support](https://caniuse.com/native-filesystem-api)
- [h5wasm - WebAssembly HDF5 Library](https://github.com/usnistgov/h5wasm)
- [jsfive - Pure JS HDF5 Reader](https://github.com/usnistgov/jsfive)
- [Tauri v2 Python Sidecar Example](https://github.com/dieharders/example-tauri-v2-python-server-sidecar)
- [Tauri Python Sidecar Discussion](https://github.com/tauri-apps/tauri/discussions/2759)
- [WebGL Performance Issue in Tauri](https://github.com/tauri-apps/tauri/issues/8020)
