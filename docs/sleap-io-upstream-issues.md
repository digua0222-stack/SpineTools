# sleap-io.js Upstream Issues

Bugs and improvements found while building sleap-label-web that should be fixed in `@talmolab/sleap-io.js` (v0.1.9).

---

## 1. `saveSlp` / `writeSlp` is Node-only — no browser SLP writing

**Severity**: Critical

**Location**: `writeSlp()` — hard guard: `if (!isNode2) { throw new Error("writeSlp currently requires a Node.js environment."); }`

**Problem**: `writeSlp` calls `new module.File(filename, "w")` where `filename` is a filesystem path, which only works in Node.js. The serialization logic itself (skeleton serialization, video serialization, frame/instance/points matrix datasets) is entirely environment-agnostic — it only uses h5wasm APIs that work in both browser and Node.

**Workaround in sleap-label-web**: Complete reimplementation of the SLP writer in `src/lib/slpWriter.ts` (477 lines). Uses h5wasm's Emscripten MEMFS virtual filesystem to create an in-memory HDF5 file, writes all data, reads back the bytes, and returns `Uint8Array`.

**Suggested fix**: Export a `saveSlpToBytes(labels: Labels, options?): Promise<Uint8Array>` function that returns raw SLP bytes without requiring a filesystem path. The existing `saveSlp` can remain as a convenience wrapper that writes those bytes to disk in Node.js.

---

## 2. Serialization internals not exported or composable

**Severity**: Medium

**Location**: Internal functions in `writeSlp` (dist lines 3108-3382)

**Problem**: Because `writeSlp` is not exported as composable pieces, the sleap-label-web SLP writer had to reimplement every serialization function: `serializeSkeletons`, `serializeVideo`, `writeTracks`, `writeSuggestions`, `writeSessions`, `serializeSession`, `serializeFrameGroup`, `serializeInstanceGroup`, `pointsToDict`, `cameraKeyForSession`, `writeLabeledFrames`, and `createMatrixDataset`. If the SLP format changes or serialization bugs are fixed upstream, the downstream copy will drift.

**Workaround in sleap-label-web**: Manually maintained 477-line TypeScript port of the serialization logic in `src/lib/slpWriter.ts`.

**Suggested fix**: Export the serialization functions (or at minimum a `serializeLabelsToHdf5(file: h5wasm.File, labels: Labels)` helper) so downstream code only needs to handle h5wasm file creation, not data serialization.

---

## 3. `Labels.find()` basename fallback incorrectly matches videos in .pkg.slp

**Severity**: High (causes wrong data to be shown/edited)

**Location**: `Labels.find()` → `Video.matchesPath(other, strict=false)`

**Problem**: `find({ video })` first checks `frame.video !== options.video` (reference equality), then falls back to `frame.video.matchesPath(options.video, false)` which compares basenames via `filename.split("/").pop()`. For `.pkg.slp` files, ALL embedded videos share the same container filename (e.g. `"val.pkg.slp"`), so the basename fallback matches every video. A project with 30 videos and 200 labeled frames returns all 200 for any video query.

**Additional issue**: `matchesPath` splits on `"/"` only, not `"\\"`, so Windows paths never match correctly in strict mode either.

**Suggested fix**:
- Option A: Remove the basename fallback entirely — use reference equality only
- Option B: Make fallback opt-in: `find({ video, fuzzyMatch: true })`
- Fix `matchesPath` to split on both `/` and `\\`

**Workaround in sleap-label-web**: Replaced all 13 `labels.find()` call sites with `labels.labeledFrames.filter(lf => lf.video === video && ...)` using reference equality.

---

## 4. `Mp4BoxVideoBackend` constructor hangs on non-fetchable URLs

**Severity**: High (blocks loading external videos entirely)

**Location**: `Mp4BoxVideoBackend` constructor → `init()` → `openSource()`

**Problem**: The constructor immediately calls `this.init()` which calls `openSource()` which does `fetch(this.filename, { method: "HEAD" })`. This fails or hangs for:
- **Bare filenames** (e.g. `"video.mp4"`) — resolves against current origin, may hang indefinitely
- **blob: URLs** — HEAD method not supported, throws `ERR_METHOD_NOT_ALLOWED`
- **Local file paths** — not fetchable at all

Since the constructor synchronously starts the async `init()`, there's no way to intercept or prevent the fetch before it's issued.

**Suggested fix**:
- Add a static factory method: `Mp4BoxVideoBackend.fromFile(file: File)` or `fromBlob(blob: Blob)` that sets `fileBlob`/`fileSize` directly and skips `openSource()`
- Or accept `File | Blob` as the first argument and skip the fetch path when detected
- Or make `init()` lazy (don't call in constructor, call on first `getFrame()`)

**Workaround in sleap-label-web**: `Object.create(Mp4BoxVideoBackend.prototype)` to build the instance without calling the constructor, manually set all properties including `fileBlob = file`, override `openSource` to no-op, then call `init()`.

---

## 5. `openSource()` HEAD-then-GET is fragile

**Severity**: Medium

**Location**: `Mp4BoxVideoBackend.openSource()`

**Problem**: `openSource()` does a HEAD request to get `Content-Length`, then tests range request support, then falls back to downloading the entire file as a blob. Issues:
- HEAD requests are sometimes blocked by CORS or CDN policies even when GET works
- Some servers don't support HEAD at all
- The full-file fallback downloads everything into memory, losing the lazy-loading benefit

**Suggested fix**: Use a single GET with `Range: bytes=0-0` to test both availability and range support in one request (status 206 = ranges supported, 200 = full response). More robust and avoids the HEAD method entirely.

---

## 6. `Video.shape` and `Video.fps` are getter-only (no setter)

**Severity**: Low

**Location**: `Video` class — `get shape()` and `get fps()` with no setters

**Problem**: `Video.shape` and `Video.fps` are computed getters that read from `this.backend?.shape` or `this.backendMetadata.shape`. There are no setters. Assignments like `video.shape = backend.shape` silently fail in non-strict mode. This makes it impossible to set shape/fps independently of the backend (e.g., from metadata before the backend is loaded).

**Workaround in sleap-label-web**: Works by accident in `resolveVideos.ts` because `video.backend` is assigned first, so the getter returns the correct value from the backend. The dead setter assignments are harmless but misleading.

**Suggested fix**: Add setters that store to a private backing field, with getters falling through to backend values.

---

## 7. `Point.score` missing from base `Point` type

**Severity**: Low

**Location**: `Point` type definition

**Problem**: The `Point` type is `{ xy, visible, complete, name? }` with no `score` field. Only `PredictedPoint` has `score`. However, SLP files can carry per-point scores for both predicted and user-corrected instances. When writing SLP files, user instances may have points that carry a score from prior prediction data, but the type system doesn't allow accessing `point.score` on a regular `Point`.

**Workaround in sleap-label-web**: Uses `(point as any).score` to bypass the type system in `slpWriter.ts`.

**Suggested fix**: Add optional `score?: number` to the base `Point` type.

---

## Summary

| # | Issue | Severity | Category |
|---|-------|----------|----------|
| 1 | `saveSlp`/`writeSlp` is Node-only | Critical | Missing browser API |
| 2 | Serialization internals not exported | Medium | API surface |
| 3 | `Labels.find()` basename fallback | High | Data correctness |
| 4 | `Mp4BoxVideoBackend` constructor hangs | High | Backend init |
| 5 | `openSource()` HEAD-then-GET fragile | Medium | Backend init |
| 6 | `Video.shape`/`fps` getter-only | Low | API design |
| 7 | `Point.score` missing from base type | Low | Type definitions |
