"""Build a portable preview and verify the real Spine runtime in Chromium."""
import base64
import io
import json
import shutil
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import async_playwright

from replay import read_json, require_same, write_json


async def verify(job):
    here = Path(__file__).resolve().parent
    dependency = here / "node_modules/@esotericsoftware/spine-canvas"
    library = dependency / "dist/iife/spine-canvas.min.js"
    if not library.exists():
        raise RuntimeError("Install the optional verification dependency: npm ci --prefix scripts/photopea --ignore-scripts")
    runtime = library.read_text(encoding="utf-8")
    manifest = read_json(job.output / "parts-manifest.json")
    html = (here / "preview.template.html").read_text(encoding="utf-8")
    html = html.replace("__CASE_NAME__", job.name).replace("__PART_COUNT__", str(len(job.order)))
    html = html.replace('<script src="work/runtime/node_modules/@esotericsoftware/spine-canvas/dist/iife/spine-canvas.js"></script>',
                        "<script>" + runtime + "</script>")
    html = html.replace(f"await (await fetch('{job.name}-spine.json')).json()",
                        job.file("spine.json").read_text(encoding="utf-8"))
    html = html.replace("await (await fetch('parts-manifest.json')).json()", json.dumps(manifest))
    embedded = {p["name"]: "data:image/png;base64," + base64.b64encode(
                (job.output / "images" / (p["name"] + ".png")).read_bytes()).decode() for p in manifest["parts"]}
    html = html.replace("(async()=>{", "(async()=>{\nconst embeddedImages=" + json.dumps(embedded) + ";", 1)
    html = html.replace("image.src='images/'+p.name+'.png'", "image.src=embeddedImages[p.name]")
    preview = job.output / "preview.html"
    preview.write_text(html, encoding="utf-8")
    shutil.copyfile(dependency / "LICENSE", job.output / "Spine-Runtime-LICENSE.txt")
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            page = await browser.new_page(viewport={"width": 1120, "height": 960})
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            await page.goto(preview.as_uri())
            await page.wait_for_function("window.ready || window.failure", timeout=30000)
            failure = await page.evaluate("window.failure")
            if failure:
                raise RuntimeError(failure)
            metric = await page.evaluate("window.validation")
            metric["browserErrors"] = errors
            metric["desktopEditorImportVerified"] = False
            write_json(job.work / "runtime-validation.json", metric)
            if errors or metric["maxGripError"] > 0.05 or metric["maxSetupPivotError"] > 0.05:
                raise ValueError(f"Runtime validation failed: {metric}")
            await page.evaluate('preview.pause();document.querySelector("#animation").value="setup";window.requestAnimationFrame=()=>0')
            await page.wait_for_timeout(80)

            async def capture(name, time, options=None):
                url = await page.evaluate("([n,t,o])=>{preview.draw(n,t,o);return preview.canvas.toDataURL('image/png');}",
                                          [name, time, options or {}])
                return Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGBA")

            setup = await capture("setup", 0)
            setup.save(job.work / "runtime-setup.png")
            metric["setupRender"] = require_same(job.image.resize(setup.size, Image.Resampling.NEAREST), setup)
            bones = await capture("setup", 0, {"bones": True})
            bones.save(job.file("bones-preview.png"))
            animation = "rig_check" if "rig_check" in metric["animations"] else next(iter(metric["animations"]), "setup")
            duration = await page.evaluate("n=>n==='setup'?1:preview.data.findAnimation(n).duration", animation)
            pose = await capture(animation, duration / 4)
            sheet = Image.new("RGB", (setup.width * 2, setup.height + 50), "#303947")
            draw = ImageDraw.Draw(sheet)
            font = ImageFont.load_default(size=25)
            for i, (image, title) in enumerate([(setup, "SETUP / ORIGINAL POSE"), (pose, "SPINE RUNTIME / JOINT CHECK")]):
                sheet.paste(image, (i * setup.width, 50), image)
                draw.text((i * setup.width + 22, 10), title, font=font, fill="white")
            sheet.save(job.file("rig-check.png"))
            frames = []
            for k in range(48):
                image = await capture(animation, k * duration / 48)
                background = Image.new("RGB", image.size, "#303947")
                background.paste(image, (0, 0), image)
                frames.append(background.resize((round(image.width * .75), round(image.height * .75)), Image.Resampling.NEAREST))
            frames[0].save(job.file("rig-check.gif"), save_all=True, append_images=frames[1:],
                           duration=max(10, round(duration * 1000 / 48)), loop=0, optimize=False, disposal=2)
            if errors:
                raise RuntimeError(f"Browser errors during rendering: {errors}")
        finally:
            await browser.close()
    write_json(job.work / "runtime-validation.json", metric)
    write_json(job.output / "validation.json", {"export": read_json(job.work / "export-validation.json"), "runtime": metric})
    (job.output / "README.txt").write_text(
        "Photopea MCP / Spine 4.2\n\n"
        "Open preview.html directly for the offline runtime preview.\n"
        f"In Spine use Import Data on {job.name}-spine.json; keep images/ alongside it.\n"
        "The PSD has raster parts and a hidden source_reference [ignore] layer.\n"
        "Runtime validation is not desktop editor import acceptance.\n"
        "Hidden areas are approximate overlap repairs. Large motion or new views need further artwork and weights.\n"
        "See validation.json for measured results and Spine-Runtime-LICENSE.txt for the bundled preview runtime license.\n",
        encoding="utf-8")
    suffixes = ["spine.psd", "spine.json", "setup.png", "parts-preview.png", "bones-preview.png", "rig-check.png", "rig-check.gif"]
    paths = [job.file(suffix) for suffix in suffixes]
    paths += [job.output / name for name in ["README.txt", "preview.html", "parts-manifest.json", "validation.json", "Spine-Runtime-LICENSE.txt"]]
    paths += [job.output / "images" / (part["name"] + ".png") for part in manifest["parts"]]
    with zipfile.ZipFile(job.file("spine-package.zip"), "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in paths:
            archive.write(path, path.relative_to(job.output).as_posix())
    print(json.dumps(metric, indent=2), flush=True)
    print(f"Verified package: {job.file('spine-package.zip')}", flush=True)
