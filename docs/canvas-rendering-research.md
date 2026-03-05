# Canvas Rendering Research for SLEAP Label Web

> **Decision (March 2026):** Raw Canvas 2D API was adopted (not Konva/PixiJS). The implementation uses two stacked canvases (frame layer + skeleton overlay) with HiDPI support. See `src/canvas/SkeletonRenderer.ts` and `src/canvas/TrailRenderer.ts`.

## Requirements Summary

The SLEAP annotation canvas needs to:
- Display video frames up to 4K resolution at 60fps during playback
- Overlay skeleton annotations: circles (nodes/keypoints), lines/wedges (edges), text labels
- Support interactive editing: click-select, drag-reposition, hover highlights
- Support zoom/pan (mouse wheel, click-drag)
- Draw track trails (movement lines across frames)
- Color instances with configurable palettes (color-by instance, track, or node)
- Handle 10-100+ instances per frame (each with ~20-30 nodes + edges)

Worst case per frame: ~3000 nodes + ~3000 edges + text labels + trail lines + 1 large background image.

---

## Approach Comparison

### 1. Canvas 2D API (Raw)

**How it works:** Direct imperative drawing via `CanvasRenderingContext2D`. Each frame, clear and redraw everything.

**Pros:**
- Simplest API, no dependencies
- Excellent text rendering (native font support, subpixel antialiasing)
- `drawImage()` for video frames is hardware-accelerated and extremely fast
- `ImageBitmap` objects can be pre-decoded and drawn with near-zero overhead
- Works everywhere, no compatibility concerns
- Low memory footprint (~4MB per 1024x1024 canvas)
- VGG Image Annotator (VIA) uses this approach successfully with zero dependencies

**Cons:**
- No scene graph -- must manually track all objects and their z-order
- Hit testing requires manual implementation (bounding box checks + `isPointInPath()`)
- No built-in event handling on shapes (click, drag, hover)
- Redraw-everything model can be wasteful (though with requestAnimationFrame this is fine for our scale)
- Zoom/pan requires manual transform matrix management

**Performance:** Drawing ~6000 simple shapes (circles + lines) per frame is well within Canvas 2D's capability at 60fps on modern hardware. The main bottleneck would be the video frame `drawImage()` call, which is GPU-accelerated anyway.

### 2. WebGL / WebGL2

**How it works:** Low-level GPU programming with shaders, vertex buffers, textures.

**Pros:**
- Maximum raw rendering performance
- Excels at batched rendering of many similar primitives (circles, lines)
- Texture-based image rendering is very fast
- Can handle 100K+ sprites without issue

**Cons:**
- Extremely complex to implement from scratch for 2D annotation
- Poor native text rendering (must use texture atlases or SDF fonts)
- Hit testing requires separate implementation (color-picking or CPU-side math)
- Significant development overhead for features like anti-aliased lines, rounded shapes
- Higher memory overhead (5-10x more than Canvas 2D for same content)
- Texture upload for video frames adds initial overhead
- Overkill for our use case (~6000 shapes is trivial)

**Verdict:** Unnecessary complexity for our scale. WebGL shines at >50K objects.

### 3. PixiJS (v8)

**How it works:** High-level 2D rendering engine using WebGL2 (with WebGPU experimental support) and Canvas 2D fallback. Scene graph with sprites, graphics, text, containers.

**Pros:**
- WebGL performance with a friendly API
- Scene graph with parent-child transforms
- `pixi-viewport` library provides excellent zoom/pan with inertia
- React integration via `@pixi/react` (v8, requires React 19)
- Sprite batching: can render 100K+ sprites efficiently
- Good text rendering via `pixiText` and `pixiHtmlText`
- Active development, large community
- `pixiGraphics` component supports imperative drawing (circles, lines, arcs)

**Cons:**
- WebGL overhead for our relatively modest shape count (~6000)
- Additional dependency (~200KB+ bundled)
- React integration (`@pixi/react` v8) requires React 19
- Text rendering quality inferior to native Canvas 2D
- Video frame display requires texture upload (adds complexity vs `drawImage`)
- Two rendering paradigms to manage (PixiJS scene graph + React DOM)
- Memory overhead from WebGL context
- Benchmarks show Canvas 2D can be *faster* than WebGL for < 10K simple shapes on some platforms

**Verdict:** Strong option if we needed game-like performance, but adds complexity without proportional benefit at our scale.

### 4. Konva.js + react-konva

**How it works:** Canvas 2D-based scene graph library. Provides a declarative React API via `react-konva`. Objects (shapes, images, text) are organized into Stages > Layers > Groups > Shapes.

**Pros:**
- **Used by Label Studio** -- proven in production annotation tools
- Built-in hit testing via hidden "hit canvas" (each shape gets a unique color)
- Built-in drag-and-drop with events (`onDragStart`, `onDragMove`, `onDragEnd`)
- Built-in mouse events on shapes (`onClick`, `onMouseEnter`, `onMouseLeave`, etc.)
- Declarative React integration: `<Stage>`, `<Layer>`, `<Circle>`, `<Line>`, `<Text>`, `<Image>`
- Layer-based rendering: static background layer + interactive annotation layer
- Excellent text rendering (native Canvas 2D)
- Zoom/pan via stage scale/position transforms
- Shape caching for complex shapes
- Custom shapes via `<Shape>` with `sceneFunc` callback
- Good documentation with annotation-specific examples (image labeling sandbox)

**Cons:**
- Slower than PixiJS for large shape counts (23fps vs 60fps at 8K shapes in benchmark)
- Canvas 2D based, so no WebGL acceleration
- Hit canvas doubles the drawing work (mitigated by simplifying hit shapes)
- `FastLayer` (no events) helps but removes interactivity
- react-konva re-renders can be expensive if not carefully memoized

**Performance optimizations available:**
- Use `listening={false}` on shapes/layers that don't need events
- Use `transformsEnabled="position"` when rotation/scale not needed per-shape
- Viewport culling: only render visible shapes
- Dedicated drag layer: move dragged shape to separate layer during drag
- Shape caching for complex composite shapes
- `FastLayer` for static elements (trails, grid lines)

**Performance estimate for SLEAP:** With ~100 instances x ~25 nodes each = 2500 circles + 2500 lines + text labels, Konva should comfortably hit 60fps. The benchmark showing 23fps at 8K was for *animated* shapes with full event handling. Static redraw of our shapes would be much faster, especially with layer separation and selective `listening`.

### 5. Fabric.js

**Pros:** Object model, serialization, rich built-in shapes.
**Cons:** Heavier than Konva, slower, less React-friendly, focused on design tools not annotation. No dedicated React bindings.
**Verdict:** Not recommended. Konva is better suited for annotation.

### 6. SVG (as used by CVAT via svg.js)

**How CVAT does it:** CVAT uses `svg.js` (v2) with SVG DOM elements for annotation shapes, overlaid on a canvas element showing the video frame.

**Pros:**
- Native DOM events on each shape (no hit testing needed)
- CSS styling for shapes
- Excellent text rendering
- Inspector-friendly (shapes visible in DOM)

**Cons:**
- **SVG performance degrades badly with many elements** (DOM overhead)
- Each shape is a DOM node -- 6000 shapes = 6000 DOM nodes
- Zoom/pan requires SVG viewBox transforms
- No efficient batching
- CVAT has known performance issues with many annotations

**Verdict:** Not recommended for SLEAP's use case with potentially thousands of shapes per frame.

---

## How Popular Annotation Tools Handle This

| Tool | Rendering | Library | Notes |
|------|-----------|---------|-------|
| **CVAT** | SVG overlay on canvas | svg.js v2 | Has performance issues with many annotations |
| **Label Studio** | Canvas 2D | Konva + react-konva | Production-proven, good interactivity |
| **VGG Image Annotator** | Canvas 2D | None (raw API) | Single-file app, 9000 lines JS |
| **Labelbox** | Canvas 2D | Proprietary | WebGL for satellite imagery |
| **V7 (Darwin)** | Canvas 2D + WebGL | Custom | WebGL for large images, Canvas 2D for overlays |

---

## Video Frame Compositing

### Recommended approach: Layered canvases

Use **two stacked canvas elements** (CSS `position: absolute`):

1. **Background canvas** (bottom): Renders the video frame via `drawImage()` with `ImageBitmap`
2. **Annotation canvas** (top): Renders all overlays (skeletons, labels, trails)

**Why two canvases:**
- Video frame only redraws on frame change (not on annotation hover/drag)
- Annotation layer redraws independently on interaction
- Avoids re-drawing the (potentially large) video frame on every mouse move
- Both canvases share the same zoom/pan transform

**Video frame rendering pipeline:**
1. Decode frame to `ImageBitmap` (can use `createImageBitmap()` in a worker)
2. Transfer `ImageBitmap` to main thread (zero-copy via `Transferable`)
3. `ctx.drawImage(imageBitmap, 0, 0)` -- hardware-accelerated, single call

**OffscreenCanvas consideration:** Could decode frames in a worker using `OffscreenCanvas`, but for our use case (single frame at a time, not real-time video compositing), the simpler approach of `createImageBitmap()` in a worker + `drawImage()` on the main thread is sufficient. OffscreenCanvas adds complexity without clear benefit here since annotation interaction must happen on the main thread anyway.

---

## Hit Testing Strategy

### Recommended: Spatial index + geometric math

For ~2500 nodes per frame:

1. **Bounding box pre-filter:** Maintain a simple spatial index (flat array or grid) of node positions. On mouse move, find candidates within radius.
2. **Distance check:** For candidate nodes, compute distance from mouse to node center. If < node radius (+ tolerance), it's a hit.
3. **Edge hit testing:** For edges (lines), compute point-to-line-segment distance. If < threshold, it's a hit.
4. **Priority:** Nodes take priority over edges. Closer nodes take priority over farther ones.

This is simpler and faster than Konva's hit canvas approach for our shapes (circles and lines). We only need geometric distance checks, not arbitrary shape containment.

**If using Konva:** It handles hit testing automatically via its hit canvas. We can optimize by setting custom hit regions (larger circles for easier clicking) and disabling hit detection on decorative elements.

---

## Zoom/Pan Implementation

### With Konva (react-konva):
```tsx
<Stage
  scaleX={zoom} scaleY={zoom}
  x={panX} y={panY}
  onWheel={handleZoom}
  draggable  // enables pan via drag
>
```

### With raw Canvas 2D:
```ts
ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
// All subsequent draws are in world coordinates
```

Both approaches are straightforward. Konva provides `stage.getPointerPosition()` which accounts for transforms, making mouse-to-world coordinate conversion easy.

---

## React Integration Patterns

### Pattern A: `useRef` + imperative Canvas 2D (raw)
```tsx
const canvasRef = useRef<HTMLCanvasElement>(null);

useEffect(() => {
  const ctx = canvasRef.current!.getContext('2d');
  // Draw everything imperatively
  drawFrame(ctx, frame);
  drawAnnotations(ctx, instances, skeleton);
}, [frame, instances, skeleton, zoom, pan]);
```
- Full control, maximum performance
- Must manually handle all interaction
- No React reconciliation overhead

### Pattern B: react-konva (declarative)
```tsx
<Stage width={width} height={height}>
  <Layer>  {/* Background */}
    <Image image={frameBitmap} />
  </Layer>
  <Layer>  {/* Annotations */}
    {instances.map(inst => (
      <Group key={inst.id}>
        {inst.edges.map(edge => (
          <Line key={edge.id} points={edgePoints} stroke={inst.color} />
        ))}
        {inst.nodes.map(node => (
          <Circle
            key={node.id}
            x={node.x} y={node.y} radius={5}
            fill={inst.color}
            draggable
            onDragEnd={handleNodeDrag}
            onClick={handleNodeClick}
          />
        ))}
      </Group>
    ))}
  </Layer>
</Stage>
```
- Declarative, React-idiomatic
- Built-in interaction handling
- Automatic dirty-region detection
- Must memoize carefully to avoid unnecessary re-renders

### Pattern C: Hybrid (recommended)
- Use **react-konva** for the annotation layer (interactivity is critical)
- Use a **raw canvas ref** for the video frame layer (maximum performance for large image blitting)
- Coordinate transforms shared between the two via React state

---

## Decision: Raw Canvas 2D API

### What was chosen and why

**Raw Canvas 2D** was selected over Konva and PixiJS. The original recommendation was Konva, but in practice raw Canvas 2D proved to be the better choice:

1. **Zero dependencies.** No Konva (~140KB) or react-konva needed. The rendering code is self-contained.
2. **Full control.** Custom hit testing, drag handling, and coordinate transforms were straightforward to implement and gave better control over interaction semantics specific to pose annotation.
3. **Performance.** Direct `drawImage()` + imperative shape drawing has minimal overhead. No scene graph reconciliation.
4. **HiDPI support.** Scaling the canvas by `devicePixelRatio` is trivial with raw Canvas 2D.
5. **Two-layer architecture.** The layered canvas approach (frame + overlay) works naturally without needing Konva's layer abstraction.

### Implemented architecture:

```
+------------------------------------------+
|            React Component Tree          |
|                                          |
|  <VideoPlayer>                           |
|    +-- <canvas ref> (video frame layer)  |  Raw Canvas 2D
|    |     drawImage(ImageBitmap)           |  (redraws on frame change only)
|    |     HiDPI: scaled by devicePixelRatio|
|    |                                     |
|    +-- <canvas ref> (skeleton overlay)   |  Raw Canvas 2D
|          SkeletonRenderer.render()       |  (redraws on annotation change)
|          TrailRenderer.render()          |  (track movement trails)
|          Hit testing via distance math   |
+------------------------------------------+
```

### Key implementation files:

- `src/canvas/SkeletonRenderer.ts` - Nodes, edges (line/wedge), labels, selection boxes, per-node colors
- `src/canvas/TrailRenderer.ts` - Track trail polylines with fading opacity
- `src/components/video/VideoPlayer.tsx` - Two-layer canvas, zoom/pan, hit testing, drag handling
- `src/lib/colorPalettes.ts` - Color palettes and color-by options (instance, track, node)

### When to reconsider:

If the app needs >10K interactive shapes per frame (unlikely for pose annotation), WebGL via PixiJS would be the escalation path. The current raw Canvas 2D handles our worst case (~6000 shapes) comfortably.

---

## Key Implementation Notes

1. **Video frame on a separate raw canvas** -- the frame layer only redraws on frame change, not on annotation interaction. This avoids re-drawing the (potentially large) video frame on every mouse move.

2. **HiDPI rendering** -- both canvases are scaled by `devicePixelRatio`. The canvas element size is set to `width * dpr` / `height * dpr` while the CSS size stays at logical pixels. This ensures crisp rendering on Retina/HiDPI displays.

3. **Coordinate transforms** -- a single zoom/pan state in the Zustand store is applied to both canvases via `ctx.setTransform()`. Mouse coordinates are converted from screen space to canvas space accounting for both zoom/pan and devicePixelRatio.

4. **Hit testing** -- uses geometric distance checks (point-to-node distance, point-to-line-segment distance) rather than a hit canvas. Nodes take priority over edges.

5. **Node dragging** -- position updates are applied directly during drag for visual feedback, with the final position committed to the data model on mouse up.

6. **Edge styles** -- supports both line and wedge (tapered) edge rendering, configurable via the View menu.

7. **Color-by options** -- instances can be colored by instance index, track assignment, or per-node, using configurable palettes from `src/lib/colorPalettes.ts`.
