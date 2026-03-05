# sleap-io.js Research

**Package:** `@talmolab/sleap-io.js` v0.2.0 (file-linked from `../sleap-io.js`)
**Source:** `/home/talmo/code/sleap-io.js/`
**License:** Not specified in package.json
**Dependencies:** h5wasm, jsfive, mp4box, skia-canvas, yaml

> **Status (March 2026):** All upstream issues from v0.1.x have been resolved in v0.2.0.
> Local workarounds (slpWriter.ts, type casts, constructor hacks) have been removed.
> See `sleap-io-upstream-issues.md` for the full resolution log.

---

## 1. Full API Surface

### Entry Points

Two entry points are exposed:

| Entry Point | Path | Purpose |
|---|---|---|
| `@talmolab/sleap-io.js` | `dist/index.js` | Full API with HDF5/video support |
| `@talmolab/sleap-io.js/lite` | `dist/lite.js` | Metadata-only, no WASM, Cloudflare Workers-compatible |

### Main Entry Exports (`index.ts`)

**Model classes:**
- `Labels` - Top-level container for all annotation data
- `LabeledFrame` - A single annotated frame
- `Instance` - User-labeled pose instance
- `PredictedInstance` - Model-predicted pose instance (extends Instance)
- `Track` - Identity track (just has a `name: string`)
- `Skeleton`, `Node`, `Edge`, `Symmetry` - Skeleton topology
- `Video` - Video reference with optional backend
- `SuggestionFrame` - Suggested frames for labeling
- `LabelsSet` - Map of named Labels (for multi-dataset usage)
- `RecordingSession`, `Camera`, `CameraGroup`, `FrameGroup`, `InstanceGroup` - Multi-camera support

**Point types:**
- `Point` - `{ xy: [number, number], visible: boolean, complete: boolean, name?: string }`
- `PredictedPoint` - `Point & { score: number }`
- `PointsArray` / `PredictedPointsArray` - Arrays of the above

**IO functions:**
- `loadSlp(source, options?)` - Load SLP file (auto-selects browser Worker or Node.js path)
- `saveSlp(labels, filename, options?)` - Save SLP file (**Node.js only**)
- `saveSlpToBytes(labels)` - Save SLP to `Uint8Array` (**browser-compatible**, added in v0.2.0)
- `loadVideo(filename, options?)` - Load video file into Video object

**Video backends:**
- `VideoBackend` (interface) - `{ filename, shape?, fps?, getFrame(idx), close() }`
- `Mp4BoxVideoBackend` - MP4 decoding via WebCodecs + mp4box (browser only)
- `StreamingHdf5VideoBackend` - Embedded images via streaming Web Worker HDF5

**Streaming HDF5 utilities:**
- `StreamingH5File` - Web Worker-based HDF5 file handle
- `openStreamingH5(url, options?)` - Open URL-based HDF5 file
- `openH5Worker(source, options?)` - Open any source via Web Worker
- `isStreamingSupported()` - Check for Worker/Blob/URL support
- `readSlpStreaming(source, options?)` - Full streaming SLP reader

**Codec utilities:**
- `toDict(labels, options?)` / `fromDict(data)` - JSON dictionary serialization
- `toNumpy(labels)` / `fromNumpy(data, options)` - 4D array conversion
- `decodeYamlSkeleton(yaml)` / `encodeYamlSkeleton(skeletons)` - YAML skeleton format

**Rendering (Node.js only via skia-canvas):**
- `renderImage(source, options)` - Render pose overlay to ImageData
- `renderVideo(labels, outputPath, options)` - Render video with ffmpeg
- `toPNG`, `toJPEG`, `toDataURL`, `saveImage` - Export utilities
- `RenderContext`, `InstanceContext` - Callback context classes
- Color utilities: `getPalette`, `resolveColor`, `PALETTES`, `NAMED_COLORS`
- Shape drawing: `drawCircle`, `drawSquare`, etc.

### Lite Entry Exports (`lite.ts`)

- `loadSlpMetadata(source, options?)` - Read metadata without pose data (pure JS, no WASM)
- `validateSlpBuffer(source)` - Structural validation
- `isHdf5Buffer(source)` - Magic number check
- `SlpMetadata` interface with: version, formatId, skeletons, tracks, videos, suggestions, sessions, counts, hasEmbeddedImages, provenance
- Re-exports: `Skeleton`, `Node`, `Edge`, `Symmetry`, `Track`
- Metadata types: `VideoMetadata`, `SuggestionMetadata`, `SessionMetadata`, `CameraMetadata`

---

## 2. Data Model Details

### Labels

```typescript
class Labels {
  labeledFrames: LabeledFrame[]
  videos: Video[]
  skeletons: Skeleton[]
  tracks: Track[]
  suggestions: SuggestionFrame[]
  sessions: RecordingSession[]
  provenance: Record<string, unknown>
}
```

**Key methods:**
- `video` (getter) - First video (convenience)
- `length` (getter) - Number of labeled frames
- `instances` (getter) - Flat list of all instances across all frames
- `find({ video?, frameIdx? })` - Filter frames by video and/or frame index
- `append(frame)` - Add a labeled frame, auto-registers video
- `toDict(options?)` - Serialize to JSON dictionary
- `numpy(options?)` - Convert to 4D array `[frames, tracks, nodes, xy]`
- `Labels.fromNumpy(data, options)` - Create from 4D array (static)
- Iterable via `Symbol.iterator`

**Auto-inference in constructor:** If `videos`, `skeletons`, or `tracks` are empty, they are automatically inferred from the `labeledFrames`.

### LabeledFrame

```typescript
class LabeledFrame {
  video: Video
  frameIdx: number
  instances: Array<Instance | PredictedInstance>
}
```

**Key methods:**
- `userInstances` (getter) - Filter to Instance only
- `predictedInstances` (getter) - Filter to PredictedInstance only
- `hasUserInstances` / `hasPredictedInstances` (getters)
- `unusedPredictions` (getter) - Predicted instances not linked to user instances
- `removePredictions()` - Remove all predicted instances
- `removeEmptyInstances()` - Remove instances with no visible points
- `image` (getter) - Returns `Promise<VideoFrame | null>` via `video.getFrame(frameIdx)`
- `numpy()` - Convert all instances to 3D array
- `at(index)` / `length` / iterable

### Instance

```typescript
class Instance {
  points: PointsArray  // Point[]
  skeleton: Skeleton
  track?: Track | null
  fromPredicted?: PredictedInstance | null
  trackingScore: number
}
```

**Key methods:**
- `getPoint(target)` - Get point by index, name, or Node object
- `nVisible` (getter) - Count of visible points
- `isEmpty` (getter) - True if no visible/valid points
- `numpy(options?)` - Convert to `number[][]` (nodes x 2)
- `boundingBox()` - Returns `[minX, minY, maxX, maxY]` or null
- `overlapsWith(other, iouThreshold)` - IoU-based overlap check
- `Instance.fromArray(points, skeleton)` - Create from raw numbers (static)
- `Instance.empty({ skeleton })` - Create with NaN points (static)

### PredictedInstance (extends Instance)

```typescript
class PredictedInstance extends Instance {
  score: number  // Instance-level confidence score
}
```

Points are `PredictedPoint[]` (each point has its own `score`).

**Distinguishing user vs predicted:** Use `instanceof PredictedInstance`.

### Point / PredictedPoint

```typescript
type Point = {
  xy: [number, number]    // x, y coordinates
  visible: boolean        // Whether point is labeled/visible
  complete: boolean       // Whether point labeling is complete
  name?: string           // Node name (optional)
}

type PredictedPoint = Point & { score: number }  // Per-point confidence
```

**Important:** Points with NaN coordinates are considered invisible/unlabeled.

### Skeleton

```typescript
class Skeleton {
  nodes: Node[]           // Node objects
  edges: Edge[]           // Edge connections
  symmetries: Symmetry[]  // Left-right symmetry pairs
  name?: string           // Optional skeleton name
}
```

**Key methods:**
- `nodeNames` (getter) - Array of node name strings
- `index(node)` - Get index from Node, name string, or number
- `node(node)` - Get Node from name, index, or Node
- `edgeIndices` (getter) - `Array<[number, number]>` of index pairs
- `symmetryNames` (getter) - `Array<[string, string]>` of name pairs
- `matches(other)` - Compare node names for compatibility
- `addEdge(source, dest)` / `addSymmetry(left, right)` - Mutate topology

Internal caches (`nameToNode`, `nodeToIndex`) provide O(1) lookups. Call `rebuildCache()` after external mutations.

### Track

```typescript
class Track {
  name: string
}
```

Minimal - just a named identity. Tracks are compared by reference identity (not name).

### Video

```typescript
class Video {
  filename: string | string[]
  backend: VideoBackend | null
  backendMetadata: Record<string, unknown>
  sourceVideo: Video | null   // Points to original if this is embedded
  openBackend: boolean
}
```

**Key methods:**
- `hasEmbeddedImages` (getter) - Whether video data is in the SLP file
- `originalVideo` (getter) - Walk sourceVideo chain to original
- `shape` (getter) - `[frames, height, width, channels]` or null
- `fps` (getter) - Frames per second or null
- `getFrame(frameIndex)` - Returns `Promise<VideoFrame | null>`
- `getFrameTimes()` - Returns `Promise<number[] | null>`
- `close()` - Release backend resources
- `matchesPath(other, strict)` - Compare filenames (strict = exact, non-strict = basename only)

### SuggestionFrame

```typescript
class SuggestionFrame {
  video: Video
  frameIdx: number
  metadata: Record<string, unknown>
}
```

### Multi-Camera Classes

- **Camera** - `{ name?, rvec, tvec, matrix?, distortions? }` (calibration data)
- **CameraGroup** - `{ cameras: Camera[], metadata }` (set of cameras)
- **InstanceGroup** - `{ instanceByCamera: Map<Camera, Instance>, score?, points?, metadata }` (same animal across views)
- **FrameGroup** - `{ frameIdx, instanceGroups, labeledFrameByCamera }` (synced frame across views)
- **RecordingSession** - `{ cameraGroup, frameGroupByFrameIdx, videoByCamera, cameraByVideo, metadata }` (full recording session)

### LabelsSet

```typescript
class LabelsSet {
  labels: Map<string, Labels>
}
```

Map-like wrapper for multiple named `Labels` objects. Supports iteration, get/set/delete.

---

## 3. Browser Capabilities

### Web Worker Architecture

All HDF5 operations run in a Web Worker to avoid blocking the main thread:

1. `StreamingH5File` creates a Worker from an inline blob URL (no external worker file needed)
2. The Worker loads h5wasm (WASM) via CDN (configurable URL)
3. All operations use `postMessage` / `onmessage` with promise-based request/response
4. Message types: `init`, `openUrl`, `openLocal`, `openBuffer`, `getKeys`, `getAttr`, `getAttrs`, `getDatasetMeta`, `getDatasetValue`, `close`

The Worker uses `createLazyFile` from h5wasm's Emscripten FS to enable HTTP range requests for URLs, and `WORKERFS` for zero-copy File object access.

### HTTP Range Request Support

For URL-based sources:
- Automatic range request support via h5wasm's lazy file mounting
- Only downloads the HDF5 chunks needed (metadata, specific datasets)
- Significantly reduces bandwidth for large SLP files
- Can be forced to full download with `h5: { stream: "download" }`
- Default is `"auto"` which tries streaming then falls back

### Import Map Requirements

Browser usage requires an import map in HTML:

```html
<script type="importmap">
{
  "imports": {
    "h5wasm": "https://unpkg.com/h5wasm@0.8.8/dist/esm/hdf5_hl.js",
    "yaml": "https://esm.sh/yaml@2.6.1",
    "skia-canvas": "data:text/javascript,export class Canvas{}",
    "child_process": "data:text/javascript,export function spawn(){}"
  }
}
</script>
```

**Note for Tauri/Vite builds:** These would be handled by the bundler instead. h5wasm and yaml would be npm dependencies. skia-canvas and child_process stubs would be configured as external/empty aliases in the Vite config.

### Source Type Support

`loadSlp()` accepts:
- `string` (URL or file path)
- `ArrayBuffer`
- `Uint8Array`
- `File` (browser File API)
- `FileSystemFileHandle` (File System Access API)

### Automatic Environment Detection

`loadSlp()` auto-selects the best loading strategy:
1. **Browser + Worker support + not download mode** -> `readSlpStreaming()` (Web Worker)
2. **Fallback** -> `readSlp()` (main thread h5wasm, Node.js native)

---

## 4. Video Backends

### VideoBackend Interface

```typescript
interface VideoBackend {
  filename: string | string[]
  shape?: [number, number, number, number]  // [frames, height, width, channels]
  fps?: number
  dataset?: string | null
  getFrame(frameIndex: number): Promise<VideoFrame | null>
  getFrameTimes?(): Promise<number[] | null>
  close(): void
}

type VideoFrame = ImageData | ImageBitmap | Uint8Array | ArrayBuffer
```

### Backend Types

#### 1. Mp4BoxVideoBackend (Browser, MP4)
- Uses WebCodecs API (`VideoDecoder`) + mp4box for MP4 demuxing
- **Requires:** Browser with WebCodecs support (Chrome 94+, Edge 94+, Firefox 130+)
- **Cache:** LRU cache of decoded `ImageBitmap` frames (default 120 frames)
- **Lookahead:** Pre-decodes 60 frames ahead of requested frame
- **Range requests:** Supports HTTP Range requests for streaming MP4 from URLs
- **Decoding strategy:** Seeks to nearest keyframe, decodes forward in batches of 15
- Returns `ImageBitmap` from cache
- mp4box is loaded lazily (import, then CDN fallback)

#### 2. Hdf5VideoBackend (Node.js, Embedded HDF5)
- For embedded images stored in SLP/HDF5 files (`.pkg.slp`)
- Uses synchronous h5wasm file access
- Supports both vlen-encoded (array of blobs) and contiguous buffer formats
- Image formats: PNG, JPEG (decoded via `createImageBitmap`), or raw pixel data
- Handles BGR -> RGB channel swap for legacy OpenCV-encoded images
- Caches the entire video dataset on first access

#### 3. StreamingHdf5VideoBackend (Browser, Embedded HDF5)
- Same as Hdf5VideoBackend but uses `StreamingH5File` (Web Worker)
- Suitable for browser when SLP file is loaded via streaming
- The underlying `StreamingH5File` stays open for the lifetime of the backend
- Same format support: vlen-encoded, contiguous buffer, PNG/JPEG/raw
- Same BGR/RGB handling

#### 4. MediaVideoBackend (Browser, HTML5 Video)
- Fallback for non-MP4 browser video
- Uses `<video>` element + `<canvas>` for frame extraction
- Seeks via `video.currentTime`, draws to canvas, returns `ImageData`
- Less precise than WebCodecs (frame-level seeking depends on browser)
- Simple but limited

### Video Factory (`createVideoBackend`)

Auto-selects backend based on filename and environment:
1. `.slp` / `.h5` / `.hdf5` / `embedded=true` -> `Hdf5VideoBackend`
2. `.mp4` + WebCodecs available -> `Mp4BoxVideoBackend`
3. Otherwise -> `MediaVideoBackend`

---

## 5. Write/Save Capabilities

### `saveSlp(labels, filename, options?)` (Node.js only)

```typescript
async function saveSlp(
  labels: Labels,
  filename: string,
  options?: { embed?: boolean | string; restoreOriginalVideos?: boolean }
): Promise<void>
```

**NODE.JS ONLY.** Throws error in browser.

### `saveSlpToBytes(labels)` (Browser-compatible, v0.2.0+)

```typescript
async function saveSlpToBytes(labels: Labels): Promise<Uint8Array>
```

Returns an SLP file as a `Uint8Array` suitable for browser download or File System Access API write. This is what `sleap-label-web` uses in `src/lib/saveProject.ts`.

**What both save functions write:**
- `/metadata` group with `format_id` (1.4) and `json` attribute (skeletons, nodes, version, provenance)
- `/videos_json` dataset - serialized video metadata
- `/tracks_json` dataset - serialized track names
- `/suggestions_json` dataset - serialized suggestion frames
- `/sessions_json` dataset - serialized multi-camera sessions
- `/frames` dataset - frame/video/instance index mapping (matrix with field_names attribute)
- `/instances` dataset - instance metadata (type, skeleton, track, score, point ranges)
- `/points` dataset - user point coordinates (x, y, visible, complete)
- `/pred_points` dataset - predicted point coordinates (x, y, visible, complete, score)

**Limitations:**
- `saveSlp`: Does NOT support embedding video frames (`embed: true` throws error, only `embed: "source"` or `false`). Requires Node.js.
- `saveSlpToBytes`: No embedding support. Returns raw bytes only.

### Dictionary Serialization (Browser-compatible)

`toDict(labels, options?)` and `fromDict(data)` provide JSON-serializable format:
```typescript
type LabelsDict = {
  version: string
  skeletons: Array<{ name?, nodes, edges, symmetries }>
  videos: Array<{ filename, shape?, fps?, backend? }>
  tracks: Array<Record<string, unknown>>
  labeled_frames: Array<{ frame_idx, video_idx, instances }>
  suggestions: Array<Record<string, unknown>>
  provenance: Record<string, unknown>
}
```

This is fully browser-compatible and could be used for local storage, API transport, or download as JSON.

### Numpy Array Conversion

`labels.numpy()` -> 4D `number[][][][]` array `[frames, tracks, nodes, xy]`
`Labels.fromNumpy(data, options)` -> Back to Labels

Useful for bulk data exchange with ML models.

---

## 6. Performance Considerations

### Large File Handling

- **Range requests:** Only download needed HDF5 chunks (metadata, specific datasets). A 500MB SLP file might only need a few MB downloaded for metadata + points.
- **Web Worker isolation:** HDF5 parsing doesn't block the main thread at all.
- **Lazy video loading:** `openVideos: false` skips video backend creation entirely.
- **Frame caching:** Mp4BoxVideoBackend maintains an LRU cache (120 frames default) and pre-decodes 60 frames ahead.

### Memory Management

- **Embedded video data:** `Hdf5VideoBackend` and `StreamingHdf5VideoBackend` cache the entire video dataset on first frame access. For large `.pkg.slp` files this could be significant.
- **ImageBitmap cleanup:** Mp4BoxVideoBackend properly calls `.close()` on evicted ImageBitmaps.
- **Worker lifecycle:** StreamingH5File terminates its Worker on `close()`. When `openVideos=true`, the file stays open (must be closed explicitly).
- **Blob/ArrayBuffer:** When loading from ArrayBuffer, the data is transferred to the Worker (zero-copy if possible).

### What to Watch For

- Loading a 100k-frame SLP file creates 100k LabeledFrame objects, each with Instance arrays. This is all in-memory.
- The `numpy()` conversion pre-allocates a dense `[maxFrame+1, tracks, nodes, channels]` array, which could be very large.
- `instances` getter on Labels calls `flatMap` each time - not cached.
- `find()` on Labels is a linear scan each time.

---

## 7. Integration Considerations for Zustand State Store

### Mutability

**All data model objects are plain mutable classes.** There are no freeze/seal operations. Properties can be freely modified:

```typescript
// All of these work:
instance.points[0].xy = [100, 200]
instance.points[0].visible = true
instance.track = someTrack
frame.instances.push(newInstance)
labels.labeledFrames.push(newFrame)
skeleton.addEdge("head", "neck")
```

This is good for a labeling tool but requires care with Zustand reactivity.

### Zustand Wrapping Strategy

**Challenge:** Zustand detects changes via reference equality. Mutating objects in place won't trigger re-renders.

**Recommended approach:**

1. **Store the Labels object as the source of truth**, but use Zustand's `immer` middleware or manual immutable update patterns:

```typescript
// Option A: Immer middleware
const useStore = create(immer((set) => ({
  labels: null as Labels | null,
  updatePoint: (frameIdx, instanceIdx, nodeIdx, xy) =>
    set((state) => {
      const frame = state.labels.labeledFrames.find(f => f.frameIdx === frameIdx)
      frame.instances[instanceIdx].points[nodeIdx].xy = xy
    }),
})))

// Option B: Signal-based approach with fine-grained subscriptions
// Use selectors to subscribe to specific data paths
```

2. **Derived/computed state** should be computed via selectors, not stored:

```typescript
// Current frame's instances
const instances = useStore(state =>
  state.labels?.find({ frameIdx: state.currentFrame })?.[0]?.instances ?? []
)
```

3. **Video frames** should be managed separately (they are async Promises, large binary data):

```typescript
// Separate store for frame image cache
const useFrameCache = create((set) => ({
  frames: new Map<string, ImageBitmap>(), // key: `${videoIdx}:${frameIdx}`
  loadFrame: async (video, frameIdx) => { ... }
}))
```

### Event/Change Notification

**There are none.** sleap-io.js has no built-in event system, observers, or change notifications. All mutations are silent.

For the web app, changes must be managed at the store level:
- Wrap mutations in store actions that call `set()`
- Use Zustand's `subscribe` for side effects
- Consider a command/undo system that captures before/after state

### Identity and Reference Semantics

Important behaviors to know:
- **Track identity is by reference**, not by name. Two `new Track("track1")` are different tracks.
- **Video matching** uses `matchesPath()` which compares filename strings (strict = exact path, non-strict = basename).
- **Skeleton matching** uses `matches()` which compares node name arrays.
- **Instance.fromPredicted** creates a reference link between user instance and its source prediction.

### Serialization Roundtrip

For undo/redo or state persistence, `toDict()` / `fromDict()` provides a clean JSON serialization:
- All references are resolved to indices
- All data is plain JSON (no classes, no circular refs)
- Can be stored in localStorage, IndexedDB, or sent to a server
- **Caveat:** `fromDict()` creates new object instances, so reference identity is lost. Track/skeleton references in the new Labels are fresh objects.

---

## 8. Key Architecture Decisions for sleap-label-web

### Loading Pipeline

```
User picks file (File API / drag-drop)
  -> loadSlp(file, { openVideos: true })
    -> Web Worker spawned
    -> h5wasm loaded in Worker
    -> HDF5 parsed (range requests if URL)
    -> Returns Labels with StreamingHdf5VideoBackend for embedded videos
  -> Store Labels in Zustand
  -> Navigate to first labeled frame
```

### Frame Display Pipeline

```
User navigates to frame N
  -> Get LabeledFrame from labels.find({ frameIdx: N })
  -> Get image: await video.backend.getFrame(N)
    -> For MP4: WebCodecs decode (cached)
    -> For embedded: Read from HDF5 Worker, decode PNG/JPEG
  -> Render image on canvas
  -> Overlay skeleton instances from LabeledFrame.instances
```

### Editing Pipeline

```
User drags a node
  -> Find the Instance and Point
  -> Update point.xy = [newX, newY]
  -> Trigger Zustand re-render
  -> Re-draw canvas overlay (image stays cached)
```

### Save Pipeline (Implemented)

Browser save is now supported via `saveSlpToBytes()` (added in sleap-io.js v0.2.0):
1. Call `saveSlpToBytes(labels)` to get a `Uint8Array`
2. Use the File System Access API (`showSaveFilePicker`) for native save dialog (Chromium)
3. Fall back to anchor-based download for other browsers
4. Implementation: `src/lib/saveProject.ts`

### What We Get "For Free"

- Complete SLP file reading in the browser with streaming
- All data model classes with proper relationships
- MP4 video playback via WebCodecs (fast, frame-accurate)
- Embedded image extraction from .pkg.slp files
- Skeleton topology with edges, symmetries
- Track management
- Multi-camera session support
- JSON dictionary serialization/deserialization
- YAML skeleton import/export
- Lite metadata-only reading for file previews

### What Has Been Built

- State management layer (Zustand + immer store in `src/stores/appStore.ts`)
- Canvas 2D rendering engine (`src/canvas/SkeletonRenderer.ts`, `src/canvas/TrailRenderer.ts`)
- HiDPI canvas support (`devicePixelRatio` scaling)
- Color-by options (instance, track, node)
- Undo/redo system (frame-level snapshots)
- Instance creation/deletion, track assignment
- Browser SLP save via `saveSlpToBytes()` (`src/lib/saveProject.ts`)
- Frame navigation, caching, and video playback
- Skeleton editor (node/edge editing in SkeletonPanel)
- 309+ passing tests (vitest)

### What Still Needs to Be Built

- Dockable panel layout (dockview-react is a dependency but not yet wired up)
- Tauri filesystem integration for native save (Tauri is scaffolded but not connected)
- Python sidecar for ML inference
- Multi-camera session support in the UI
