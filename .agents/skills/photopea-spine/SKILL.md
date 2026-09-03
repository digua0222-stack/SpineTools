---
name: photopea-spine
description: Use a locally configured Photopea MCP to split flat character art into raster PSD parts, reconstruct concealed joint overlaps and weapons, and verify an initial Spine rig. Use for Photopea-based PSD splitting and replaying reviewed part recipes; this is not automatic semantic segmentation.
---

# Photopea → PSD → Spine

Work from the SpineTools repository root. Read the [runbook](../../../docs/PHOTOPEA_MCP_WORKFLOW.zh-CN.md) for setup, commands, recipe fields and recorded limitations.

## Route the request

- For the reviewed Zhao Yun image, use `scripts/photopea/replay.py` with `examples/photopea/zhaoyun`. Its source size and SHA256 are checked before any editing.
- For new art, inspect the image and create a separate recipe. Do not reuse Zhao Yun polygons or merely change the source hash. Define the layer order, hidden overlaps and pivots for the new pose. SAM masks may provide initial cuts if already available; the Photopea route does not require SAM or a GPU model.
- If the user requests only PSD, the replay `--stage psd` stops after layered PSD and exact setup verification. Add rig export and runtime verification when binding or animation is part of the task.

## Preserve these working invariants

1. Use the actual MCP tool schema. This implementation uses `open_image`, `run_script`, `export_image` over STDIO. Its configuration is read-only. A missing direct tool in the current session can be handled by the Python MCP client; a new browser or direct PSD writer does not prove an MCP call occurred.
2. Keep the source unchanged and maintain one full-canvas coordinate system. Preserve a hidden `source_reference [ignore]` layer. L/R in this example means screen left/right.
3. Cut front occluders first: hands, weapon, armor plates and kneecaps. Use non-antialiased polygon selections for an exact source pixel partition. Duplicate from the remaining pixels and clear the same region from the remainder.
4. Reassemble and compare alpha and premultiplied RGB before repairing anything. Correct ownership errors such as skin pixels left on a weapon or cloak pixels attached to armor.
5. Reconstruct the shaft beneath both grips and add concealed joint overlaps. Place repairs behind each original part, clip to the intended shape, then merge. The supplied recipe also clips repairs to opaque source pixels belonging to the part or foreground parts, preserving the setup appearance. This limits the amount of hidden anatomy it can restore.
6. Save ordinary raster layers. Export trimmed PNGs with padding and derive attachment offsets from the PSD bounds and bone transforms; do not center every part independently.
7. Verify weapon continuity, nonempty attachments, initial reconstruction, bone transforms and hand-to-weapon constraints. Inspect an actual runtime render. State clearly whether desktop Spine import was also tested.

## Photopea scripting constraints observed here

- Scripts run in Photopea's restricted interpreter. Use ES3-style loops; arrow functions, template strings and `Array.map` are unreliable. A runtime error may produce no echo and time out.
- `selection.select(points, SelectionType.REPLACE, 0, false)` gives the tested hard partition. Deselect before later layer operations.
- `getByName` for a missing layer aborts a script; validate names beforehand.
- Move relative to a layer using `PLACEBEFORE` / `PLACEAFTER`; document-relative placement was ignored in the tested build.
- `selection.fill` needs a `SolidColor` with explicit RGB values. Direct foreground hex assignment was ignored.
- The MCP `add_gradient` tool covers the canvas and does not accept x/y/width/height. For local repair shading, the replay paints color bands inside Photopea. Do not infer success from an accepted but unsupported argument.
- If the validated Windows DLL-load hang reappears, use `scripts/photopea/run_server.py` to preload NumPy/Pillow/psd-tools before the server starts its STDIO threads. Do not repeatedly retry an unchanged failing operation.

The output is a current-view binding base. Exact reassembly and successful runtime loading do not establish production quality for large attacks, turns or occluded anatomy. Inspect the proposed motion and describe remaining painting or weight work concretely.
