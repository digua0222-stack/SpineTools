"""Replay a reviewed part recipe through Photopea MCP and export a Spine rig.

Python inspects PSDs and serializes attachments. Selection, cutting, painting,
transfers, compositing and PSD serialization are actual Photopea MCP operations.
This does not infer semantic parts or hidden anatomy from an arbitrary image.
"""
from __future__ import annotations

import argparse
import asyncio
import copy
import hashlib
import json
import math
import os
import re
import tomllib
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from psd_tools import PSDImage
from scipy.ndimage import label

REPO = Path(__file__).resolve().parents[2]


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def rect(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def select(points):
    # The fourth argument disables antialiasing. Adjacent cuts partition pixels.
    return f"d.selection.select({json.dumps(points)},SelectionType.REPLACE,0,false);"


def keep(points):
    return select(points) + "d.selection.invert();d.selection.clear();d.selection.deselect();"


def fill(points, color):
    color = color.lstrip("#")
    r, g, b = [int(color[i:i + 2], 16) for i in (0, 2, 4)]
    return (select(points) + f"var c=new SolidColor();c.rgb.red={r};c.rgb.green={g};"
            f"c.rgb.blue={b};d.selection.fill(c);d.selection.deselect();")


def mask_rectangles(mask, x0, y0):
    """Compress a selection into horizontal runs joined across adjacent rows."""
    active, done = {}, []
    for y, row in enumerate(mask):
        changes = np.flatnonzero(np.diff(np.pad(row.astype(np.int8), (1, 1))))
        runs = set(zip(changes[::2].tolist(), changes[1::2].tolist()))
        for run in list(active):
            if run not in runs:
                start = active.pop(run)
                done.append(rect(x0 + run[0], y0 + start, x0 + run[1], y0 + y))
        for run in runs:
            active.setdefault(run, y)
    for run, start in active.items():
        done.append(rect(x0 + run[0], y0 + start, x0 + run[1], y0 + len(mask)))
    return done


def visible_error(source, result):
    a = np.array(source.convert("RGBA"), dtype=np.float32)
    b = np.array(result.convert("RGBA"), dtype=np.float32)
    if a.shape != b.shape:
        raise ValueError(f"Canvas changed: {a.shape} -> {b.shape}")
    return {
        "alphaChangedPixels": int(np.sum(a[:, :, 3] != b[:, :, 3])),
        "premultipliedRGB_MAE": float(np.abs(
            a[:, :, :3] * a[:, :, 3:] / 255 - b[:, :, :3] * b[:, :, 3:] / 255
        ).mean()),
    }


def require_same(source, result):
    metric = visible_error(source, result)
    if metric["alphaChangedPixels"] or metric["premultipliedRGB_MAE"]:
        raise ValueError(f"Setup reconstruction changed: {metric}")
    return metric


class Job:
    def __init__(self, args):
        self.case = args.case.resolve()
        self.recipe = read_json(self.case / "recipe.json")
        self.rig = read_json(self.case / "rig.json")
        self.source = (args.source or self.case / self.recipe["source"]).resolve()
        self.output = args.output.resolve()
        self.name = self.recipe["name"]
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", self.name):
            raise ValueError("Recipe name must be a filename-safe identifier")
        with Image.open(self.source) as image:
            self.image = image.convert("RGBA")
        if list(self.image.size) != self.recipe["sourceSize"]:
            raise ValueError("Recipe canvas differs from source; review the polygons first")
        self.sha = hashlib.sha256(self.source.read_bytes()).hexdigest()
        if self.sha != self.recipe["sourceSHA256"]:
            raise ValueError("Source SHA256 differs from reviewed recipe; do not reuse unreviewed cuts")
        self.order = self.recipe["order"]
        names = [p["name"] for p in self.recipe["cuts"]] + [self.recipe["remaining"]]
        if any(not re.fullmatch(r"[a-zA-Z0-9_-]+", name) for name in names):
            raise ValueError("Part names must be filename-safe identifiers")
        if len(set(names)) != len(names) or set(names) != set(self.order) or len(self.order) != len(names):
            raise ValueError("Cuts, remaining part and draw order must name each part once")
        if set(s["name"] for s in self.rig["slots"]) != set(names) or len(self.rig["slots"]) != len(names):
            raise ValueError("Rig must contain one slot per part")
        for transfer in self.recipe["transfers"]:
            if transfer["source"] not in names or transfer["target"] not in names:
                raise ValueError("Transfer names a missing part")
            if transfer["source"] == transfer["target"]:
                raise ValueError("Transfer source and target must differ")
        self.output.mkdir(parents=True, exist_ok=True)
        self.work = self.output / "work"
        self.work.mkdir(exist_ok=True)
        self.config = args.codex_config
        self.server = args.mcp_server

    def file(self, suffix):
        return self.output / f"{self.name}-{suffix}"


@asynccontextmanager
async def mcp_session(job):
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    config = tomllib.loads(job.config.read_text(encoding="utf-8-sig"))["mcp_servers"][job.server]
    if "command" not in config:
        raise ValueError("This replay entry expects an existing STDIO MCP server")
    params = StdioServerParameters(command=config["command"], args=config.get("args", []),
                                  cwd=config.get("cwd"), env={**os.environ, **config.get("env", {})})
    transcript = []
    with (job.work / "mcp-stderr.log").open("w", encoding="utf-8") as log:
        async with stdio_client(params, errlog=log) as (reader, writer):
            async with ClientSession(reader, writer, read_timeout_seconds=timedelta(seconds=180)) as client:
                await client.initialize()
                discovered = await client.list_tools()
                tool_names = {t.name for t in discovered.tools}
                if not {"open_image", "export_image", "run_script"} <= tool_names:
                    raise ValueError("MCP server does not expose the required Photopea tools")
                write_json(job.work / "mcp-tools.json", [t.model_dump(mode="json") for t in discovered.tools])

                async def call(tool, **arguments):
                    result = await client.call_tool(tool, arguments)
                    text = "\n".join(c.text for c in result.content if c.type == "text")
                    transcript.append({"tool": tool, "arguments": arguments, "result": text, "error": result.isError})
                    # Do not serialize the client config, command environment or credentials.
                    write_json(job.work / "mcp-transcript.json", transcript)
                    if result.isError or text.strip().lower().startswith("error:"):
                        raise RuntimeError(text)
                    return text

                yield call


async def build_psd(job):
    width, height = job.image.size
    async with mcp_session(job) as call:
        async def js(script):
            result = await call("run_script", script=script + 'app.echoToOE("replay_ok");')
            if "replay_ok" not in result:
                raise RuntimeError(f"Photopea did not complete the script: {result}")

        async def export(path, format):
            print(await call("export_image", path=str(path), format=format), flush=True)

        print(await call("open_image", path=str(job.source)), flush=True)
        await js('var d=app.activeDocument;var s=d.activeLayer;s.name="_remaining";'
                 'var r=s.duplicate();r.name="source_reference [ignore]";r.visible=false;d.activeLayer=s;')
        for part in job.recipe["cuts"]:
            name = json.dumps(part["name"])
            await js('var d=app.activeDocument;var s=d.layers.getByName("_remaining");'
                     f'var p=s.duplicate();p.name={name};p.visible=true;d.activeLayer=p;'
                     + keep(part["points"]) + 'd.activeLayer=s;' + select(part["points"])
                     + 'd.selection.clear();d.selection.deselect();')
        await js(f'app.activeDocument.layers.getByName("_remaining").name={json.dumps(job.recipe["remaining"])};')
        await export(job.work / "cutout.psd", "psd")
        await export(job.work / "cutout.png", "png")
        require_same(job.image, Image.open(job.work / "cutout.png"))

        for transfer in job.recipe["transfers"]:
            source, target = json.dumps(transfer["source"]), json.dumps(transfer["target"])
            points = transfer["points"]
            await js(f'var d=app.activeDocument;var s=d.layers.getByName({source});var t=d.layers.getByName({target});'
                     'var p=s.duplicate();p.name="_transfer";d.activeLayer=p;' + keep(points)
                     + 'd.activeLayer=s;' + select(points) + 'd.selection.clear();d.selection.deselect();'
                     + 'p.move(t,ElementPlacement.PLACEBEFORE);d.activeLayer=p;p.merge();'
                     + f'd.activeLayer.name={target};')
        await export(job.work / "clean.psd", "psd")
        await export(job.work / "clean.png", "png")
        require_same(job.image, Image.open(job.work / "clean.png"))
        clean = PSDImage.open(job.work / "clean.psd")
        original = {layer.name: np.array(layer.composite(viewport=(0, 0, width, height)))[:, :, 3]
                    for layer in clean if layer.visible}
        script = "var d=app.activeDocument;"
        for below, above in zip(job.order, job.order[1:]):
            script += (f'd.layers.getByName({json.dumps(above)}).move('
                       f'd.layers.getByName({json.dumps(below)}),ElementPlacement.PLACEBEFORE);')
        await js(script)
        for patch in job.recipe["patches"]:
            name, polygon = patch["name"], patch["points"]
            if name not in job.order:
                raise ValueError(f"Patch names a missing layer: {name}")
            points = np.array(polygon)
            x0, y0 = np.floor(points.min(axis=0)).astype(int)
            x1, y1 = np.ceil(points.max(axis=0)).astype(int)
            if not (0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height):
                raise ValueError(f"Patch leaves the source canvas: {name}")
            allowed = np.maximum.reduce([original[n] for n in job.order[job.order.index(name):]]) >= 254
            erase = mask_rectangles(~allowed[y0:y1, x0:x1], int(x0), int(y0))
            script = 'var d=app.activeDocument;var p=d.artLayers.add();p.name="_repair";'
            if "fills" in patch:
                for band in patch["fills"]:
                    script += fill(band["points"], band["color"])
            else:
                ramp = np.array([[int(c.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)] for c in patch["colors"]])
                if len(ramp) < 2:
                    raise ValueError("A local ramp requires at least two colors")
                for x in range(int(x0), int(x1)):
                    t = (x - x0) / max(1, x1 - x0 - 1) * (len(ramp) - 1)
                    i = min(int(t), len(ramp) - 2)
                    rgb = np.round(ramp[i] * (1 - t + i) + ramp[i + 1] * (t - i)).astype(int)
                    script += fill(rect(x, int(y0), x + 1, int(y1)), "".join(f"{v:02x}" for v in rgb))
            await js(script)
            script = 'var d=app.activeDocument;var p=d.layers.getByName("_repair");d.activeLayer=p;' + keep(polygon)
            for region in erase:
                script += select(region) + "d.selection.clear();"
            script += ('d.selection.deselect();' + f'var t=d.layers.getByName({json.dumps(name)});'
                       'p.move(t,ElementPlacement.PLACEAFTER);d.activeLayer=t;t.merge();'
                       f'd.activeLayer.name={json.dumps(name)};')
            await js(script)
            print(f"repaired {name}", flush=True)
        await export(job.file("spine.psd"), "psd")
        await export(job.file("setup.png"), "png")
        require_same(job.image, Image.open(job.file("setup.png")))


def bone_world(bones):
    world = {}
    for bone in bones:
        name = bone["name"]
        if name in world:
            raise ValueError(f"Duplicate bone: {name}")
        parent = bone.get("parent")
        if parent and parent not in world:
            raise ValueError(f"Parent must precede child: {name}")
        # This workflow's region rig uses translation/rotation only in setup.
        if any(bone.get(k, default) != default for k, default in
               (("scaleX", 1), ("scaleY", 1), ("shearX", 0), ("shearY", 0))):
            raise ValueError("Scaled or sheared setup bones require a matrix-aware exporter")
        if bone.get("transform", "normal") != "normal":
            raise ValueError("This recipe exporter expects normal transform inheritance")
        bx, by, ba = world[parent] if parent else (0, 0, 0)
        t = math.radians(ba)
        x, y = bone.get("x", 0), bone.get("y", 0)
        world[name] = (bx + x * math.cos(t) - y * math.sin(t),
                       by + x * math.sin(t) + y * math.cos(t), ba + bone.get("rotation", 0))
    return world


def export_spine(job):
    psd = PSDImage.open(job.file("spine.psd"))
    layers = {layer.name: layer for layer in psd if layer.visible}
    if set(layers) != set(job.order) or len(psd) != len(job.order) + 1:
        raise ValueError("Final PSD layers do not match the recipe")
    world = bone_world(job.rig["bones"])
    origin_x, origin_y = job.recipe["originImage"]
    images = job.output / "images"
    images.mkdir(exist_ok=True)
    attachments, metadata = {}, []
    slot_map = {s["name"]: s for s in job.rig["slots"]}
    for name in job.order:
        layer = layers[name]
        x0, y0, x1, y1 = layer.bbox
        pad = job.recipe.get("padding", 2)
        viewport = (x0 - pad, y0 - pad, x1 + pad, y1 + pad)
        image = layer.composite(viewport=viewport).convert("RGBA")
        if not image.getbbox():
            raise ValueError(f"Empty part: {name}")
        image.save(images / f"{name}.png")
        bn = slot_map[name]["bone"]
        bx, by, ba = world[bn]
        dx = (viewport[0] + viewport[2]) / 2 - origin_x - bx
        dy = origin_y - (viewport[1] + viewport[3]) / 2 - by
        t = math.radians(ba)
        attachments[name] = {name: {"type": "region", "path": name,
                                   "x": round(dx * math.cos(t) + dy * math.sin(t), 6),
                                   "y": round(-dx * math.sin(t) + dy * math.cos(t), 6),
                                   "rotation": round(-ba, 6), "width": image.width, "height": image.height}}
        metadata.append({"name": name, "bone": bn, "bounds": list(layer.bbox), "pngViewport": list(viewport),
                         "width": image.width, "height": image.height,
                         "pixels": int(np.sum(np.array(image)[:, :, 3] > 0)),
                         "pivotImage": [round(bx + origin_x, 6), round(origin_y - by, 6)]})
    skeleton = copy.deepcopy(job.rig)
    skeleton["slots"] = [dict(slot_map[n], attachment=n) for n in job.order]
    skeleton["skins"] = [{"name": "default", "attachments": attachments}]
    skeleton["skeleton"]["images"] = "./images/"
    write_json(job.file("spine.json"), skeleton)
    write_json(job.output / "parts-manifest.json", {"sourceSize": list(job.image.size),
               "originImage": [origin_x, origin_y], "leftRightConvention": job.recipe["leftRightConvention"],
               "grips": job.recipe.get("grips", []), "parts": metadata})
    report = {"sourceSHA256": job.sha, "psdLayers": len(psd), "visibleParts": len(layers),
              "bones": len(world), "slots": len(metadata), "ikConstraints": len(skeleton.get("ik", [])),
              "setup": require_same(job.image, Image.open(job.file("setup.png"))), "connectedParts": {}}
    for name in job.recipe.get("connectedParts", []):
        _, count = label(np.array(layers[name].composite())[:, :, 3] > 127)
        report["connectedParts"][name] = count
        if count != 1:
            raise ValueError(f"Disconnected reconstructed part: {name} ({count})")
    write_json(job.work / "export-validation.json", report)
    # A contact sheet is an inspection artifact, derived from the final PSD.
    sheet = Image.new("RGB", (1500, math.ceil(len(job.order) / 6) * 225), "#303947")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=18)
    for i, name in enumerate(job.order):
        image = layers[name].composite().convert("RGBA")
        image = image.crop(image.getbbox())
        scale = min(3, 230 / image.width, 178 / image.height)
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.NEAREST)
        x, y = i % 6 * 250, i // 6 * 225
        draw.text((x + 12, y + 8), name, font=font, fill="white")
        sheet.paste(image, (x + (250 - image.width) // 2, y + 37 + (178 - image.height) // 2), image)
    sheet.save(job.file("parts-preview.png"))
    print(json.dumps(report, indent=2), flush=True)


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", type=Path, default=REPO / "examples/photopea/zhaoyun")
    parser.add_argument("--source", type=Path, help="Optional location of the exact reviewed source image")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--codex-config", type=Path,
                        default=Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "config.toml")
    parser.add_argument("--mcp-server", default="photopea")
    parser.add_argument("--stage", choices=["all", "psd", "export", "verify"], default="all")
    return parser.parse_args()


def main():
    args = arguments()
    job = Job(args)
    if args.stage in ("all", "psd"):
        asyncio.run(build_psd(job))
    if args.stage in ("all", "export"):
        export_spine(job)
    if args.stage in ("all", "verify"):
        from verify_runtime import verify
        asyncio.run(verify(job))


if __name__ == "__main__":
    main()
