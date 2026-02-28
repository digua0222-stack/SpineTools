# SLEAP Label Web

Web-based labeling GUI for [SLEAP](https://sleap.ai) animal pose estimation and tracking.

This is a port of SLEAP's Qt/Python desktop labeling interface to a modern web stack, with an optional Tauri v2 desktop shell for native file access.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS v4
- **State**: Zustand + Immer
- **Rendering**: Canvas 2D API (two-layer: video frame + skeleton overlay)
- **Data**: [@talmolab/sleap-io.js](https://github.com/talmolab/sleap-io.js) for SLP file loading
- **Desktop**: Tauri v2 (~5MB .deb vs ~244MB Electron)

## Development

```bash
# Install dependencies
npm install

# Start dev server (browser mode)
npm run dev

# Start Tauri dev mode (desktop, requires system deps)
npm run tauri:dev

# Production build (browser)
npm run build

# Production build (desktop)
npm run tauri:build
```

### System Dependencies (Linux, for Tauri)

```bash
sudo apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev \
  libjavascriptcoregtk-4.1-dev librsvg2-dev patchelf \
  libglib2.0-dev libayatana-appindicator3-dev
```

## Features

- SLP file loading via drag-and-drop or file dialog
- Video frame rendering with skeleton overlay
- Instance selection, node dragging, and node placement
- Zoom, pan, and fit-to-instances view controls
- Undo/redo with frame-level snapshots
- 40+ keyboard shortcuts matching SLEAP's defaults
- Side panels: Videos, Skeleton, Instances, Suggestions
- Right-click context menu for instance/node actions
- Video playback with speed control (0.25x-8x)
- Menu bar: File, Edit, Go, View, Labels, Tracks

## License

BSD-3-Clause. See [LICENSE](LICENSE).
