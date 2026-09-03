"""Prepare reviewed, CPU-only inpainting fixtures through actual Photopea MCP.

Python computes geometric masks and verifies pixels. Photopea performs source
matting, part isolation, crop/resize, placeholder painting and image export.
GPU users can skip this script: all prepared assets are checked into examples/.
"""
from __future__ import annotations
import argparse, asyncio, hashlib, json, shutil, sys, types
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import binary_closing, binary_fill_holes, label
REPO=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(REPO/'scripts/photopea'))
from replay import mcp_session, mask_rectangles, select, fill
CASE=REPO/'examples/comfy-inpaint/zhaoyun-v2'
SIZE=(1024,1024)
SOURCE_SHA256='5b952c09b0240b017c7d0107da02e7f7e5247c10f5d0c60f01ec83e2b7d7b988'

def polygon(points):
    im=Image.new('L',SIZE);ImageDraw.Draw(im).polygon(points,fill=255)
    return np.array(im)>0

def local(mask,crop):
    return np.array(Image.fromarray(mask.astype('uint8')*255).crop(crop).resize((512,512),Image.Resampling.NEAREST))>0

def definitions():
    return [
      dict(id='cape_control',purpose='known_texture_control',crop=[96,400,608,912],pivotImage=None,
           hole=[[219,591],[269,581],[293,631],[242,661]],
           prompt='A silver white cloth cape in a chibi fantasy game sprite, continuous flowing lavender gray fabric folds, directional white highlights, subtle blue purple shadows, crisp dark outline, match the existing pixel art shading and fabric, restore the missing cloth texture.'),
      dict(id='cape_complete',purpose='hidden_part_completion',crop=[96,400,608,912],pivotImage=[393,497],
           target=[[397,490],[437,508],[459,560],[479,610],[500,660],[539,712],[552,747],[525,772],[478,787],[410,786],[372,798],[334,793],[313,767],[295,745],[280,751],[263,770],[240,765],[214,746],[199,715],[195,686],[191,665],[183,651],[163,643],[144,649],[123,659],[125,628],[139,600],[160,575],[196,557],[248,548],[293,543],[323,532],[356,510]],
           known=[[349,504],[338,544],[335,568],[345,610],[358,629],[343,658],[328,692],[315,730],[315,754],[324,776],[337,790],[319,776],[312,755],[296,742],[283,750],[266,767],[241,764],[218,749],[204,724],[195,690],[191,665],[181,650],[161,644],[139,651],[123,660],[123,628],[137,600],[159,576],[194,558],[245,548],[295,542],[328,525]],
           prompt='One isolated complete flowing silver white cloth cape, chibi Chinese fantasy RPG sprite asset, cloth extends from the shoulder attachment at upper right and flows to lower left, continuous lavender gray fabric folds across the whole cape, white highlights and purple gray shadows, crisp dark outer contour, keep the existing visible fabric unchanged, finish the missing right half with matching fabric. No person, no armor.'),
      dict(id='thigh_L_complete',purpose='hidden_part_completion',crop=[352,560,608,816],pivotImage=[477,642],
           target=[[456,619],[478,615],[501,632],[507,665],[497,698],[478,734],[450,738],[430,726],[425,702],[435,661]],
           known=[[447,674],[478,665],[493,669],[491,687],[476,695],[463,694],[451,699],[437,704],[427,700],[427,690]],
           prompt='One isolated complete upper leg part of a chibi silver armored Chinese warrior game sprite, dark gray under armor fabric with silver highlights, rounded hip attachment at the top and rounded knee overlap at the bottom, short stout thigh, coherent curved volume, match the existing painted texture and pixel density. Only one thigh, no kneecap, no boot, no skirt, no torso.'),
      dict(id='forearm_L_complete',purpose='hidden_part_completion',crop=[256,400,512,656],pivotImage=[384,494],
           target=[[363,481],[387,471],[408,483],[418,510],[419,541],[410,568],[379,576],[359,561],[352,531],[353,504]],
           known=[[356,510],[377,502],[397,506],[414,517],[415,540],[407,555],[370,563],[357,548]],
           prompt='One isolated complete silver armored forearm for a chibi Chinese fantasy game sprite, rounded elbow overlap at top and wrist overlap at bottom, short cylindrical silver plate bracer, crisp dark contour, white metal highlights and lavender gray shadows, match the existing center armor texture. Only one forearm, no hand, no shoulder pauldron, no torso.')
    ]

async def prepare(source):
    if hashlib.sha256(source.read_bytes()).hexdigest()!=SOURCE_SHA256:
        raise ValueError('This recipe is for the checked-in standing image only; review new geometry for a different source')
    CASE.mkdir(parents=True,exist_ok=True)
    destination=CASE/'source.png'
    if source.resolve()!=destination.resolve():shutil.copyfile(source,destination)
    raw=Image.open(destination).convert('RGB');assert raw.size==SIZE
    a=np.array(raw)
    fg=(a.min(2)<202)|((a.max(2).astype(int)-a.min(2))>=22)
    fg[:65]=False;fg[850:]=False;fg[:,:105]=False;fg[:,710:]=False
    labs,n=label(binary_closing(fg,structure=np.ones((3,3))));sizes=np.bincount(labs.ravel());sizes[0]=0
    fg=binary_fill_holes(labs==sizes.argmax())
    work=REPO/'output/comfy-inpaint-preparation';work.mkdir(parents=True,exist_ok=True)
    job=types.SimpleNamespace(config=Path.home()/'.codex/config.toml',server='photopea',work=work)
    tasks=[]
    async with mcp_session(job) as call:
        async def js(code):
            result=await call('run_script',script=code+'app.echoToOE("prepared_ok");')
            if 'prepared_ok' not in result:raise RuntimeError(result)
        async def export(path): await call('export_image',path=str(path),format='png')
        async def clear_mask(mask):
            code='var d=app.activeDocument;'
            for r in mask_rectangles(mask,0,0):code+=select(r)+'d.selection.clear();'
            await js(code+'d.selection.deselect();')
        async def paint_mask(mask,color):
            code='var d=app.activeDocument;'
            for r in mask_rectangles(mask,0,0):code+=fill(r,color)
            await js(code)
        async def mask_file(mask,path):
            await call('create_document',width=mask.shape[1],height=mask.shape[0],name=path.stem,fill='#000000')
            await paint_mask(mask,'#ffffff');await export(path)
        async def crop_source(crop,folder):
            await call('open_image',path=str(destination))
            await js('var d=app.activeDocument;var s=d.activeLayer;var p=s.duplicate();s.visible=false;d.activeLayer=p;')
            x0,y0,x1,y1=crop
            await call('crop',x=x0,y=y0,width=x1-x0,height=y1-y0)
            await export(folder/'reference-native.png')
            if x1-x0!=512:await call('resize_image',width=512,height=512)
            await export(folder/'reference-model.png')
        await call('open_image',path=str(destination))
        await js('var d=app.activeDocument;var s=d.activeLayer;var p=s.duplicate();s.visible=false;d.activeLayer=p;')
        await clear_mask(~fg);await export(CASE/'character-transparent.png')
        for task in definitions():
            folder=CASE/'tasks'/task['id'];folder.mkdir(parents=True,exist_ok=True)
            crop=task['crop'];await crop_source(crop,folder)
            if task['purpose']=='known_texture_control':
                target=np.ones((512,512),bool);mask=local(polygon(task['hole']),crop);known=~mask
                assert np.all(local(fg,crop)[mask]),'Control hole leaves the source character'
                await export(folder/'ground-truth.png')
                await paint_mask(mask,'#9094a8');await export(folder/'input.png')
                await clear_mask(mask);await export(folder/'known.png')
            else:
                known=local(polygon(task['known']) & fg,crop)
                target=local(polygon(task['target']),crop) | known
                mask=target & ~known
                await clear_mask(~known);await export(folder/'known.png')
                await js('var d=app.activeDocument;d.activeLayer.name="known";var t=d.artLayers.add();t.name="target";')
                await paint_mask(target,'#9094a8')
                await js('var d=app.activeDocument;d.activeLayer.move(d.layers.getByName("known"),ElementPlacement.PLACEAFTER);var b=d.artLayers.add();b.name="background";')
                await paint_mask(np.ones((512,512),bool),'#303947')
                await js('var d=app.activeDocument;d.activeLayer.move(d.layers.getByName("target"),ElementPlacement.PLACEAFTER);')
                await export(folder/'input.png')
            for m,f in [(mask,'mask.png'),(target,'target-alpha.png'),(known,'keep-mask.png')]:await mask_file(m,folder/f)
            native_size=(crop[2]-crop[0],crop[3]-crop[1])
            for m,f in [(target,'target-alpha-native.png'),(known,'keep-mask-native.png')]:
                native=np.array(Image.fromarray(m.astype('uint8')*255).resize(native_size,Image.Resampling.NEAREST))>0
                await mask_file(native,folder/f)
            observed=np.array(Image.open(folder/'mask.png').convert('L'))
            assert np.array_equal(observed,mask.astype('uint8')*255)
            original_crop=Image.open(folder/'reference-model.png').convert('RGB')
            prepared=np.array(Image.open(folder/'input.png').convert('RGB'))
            assert np.array_equal(prepared[known],np.array(original_crop)[known]),'Known pixels changed'
            task.update(modelSize=[512,512],maskConvention='white=edit, black=preserve; read RED channel, not alpha',
                        knownPixels=int(known.sum()),editPixels=int(mask.sum()),targetPixels=int(target.sum()),
                        background='#303947',placeholder='#9094a8',resample='Photopea working resize; restore original native pixels after generation',
                        sourceScale=(crop[2]-crop[0])/512,
                        files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.glob('*.png')})
            tasks.append(task);print(f'Prepared {task["id"]}: {mask.sum()} pixels to repaint',flush=True)
    manifest=dict(schemaVersion=1,source='source.png',sourceSize=list(SIZE),sourceSHA256=hashlib.sha256(destination.read_bytes()).hexdigest(),
                  sourceHasBakedCheckerboard=True,sourceDescription='User-provided new standing Zhao Yun image; not a video frame',
                  preparedBy='Photopea MCP on CPU; no model-generated images included',gpuInferenceVerified=False,
                  defaultCheckpoint='512-inpainting-ema.safetensors',seeds=[17,41,73],steps=28,cfg=7.0,denoise=1.0,
                  sampler='euler',scheduler='normal',
                  negative='photorealistic, blurry, muddy texture, gray placeholder, extra limbs, hands, face, text, watermark, checkerboard, scenery, duplicated armor, inconsistent lighting',tasks=tasks)
    (CASE/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    write_overview(tasks)
    print('Prepared fixture package; GPU generation remains untested.',flush=True)

def write_overview(tasks):
    # Derived contact sheet for human inspection, not model training/input artwork.
    sheet=Image.new('RGB',(1536,4*550),'#202837');d=ImageDraw.Draw(sheet);font=ImageFont.load_default(size=22)
    for row,task in enumerate(tasks):
        f=CASE/'tasks'/task['id']
        for col,name in enumerate(['input.png','mask.png','known.png']):
            im=Image.open(f/name).convert('RGBA');base=Image.new('RGBA',im.size,'#303947');base.alpha_composite(im)
            sheet.paste(base.convert('RGB'),(col*512,row*550+38))
            d.text((col*512+10,row*550+5),task['id']+' / '+name,font=font,fill='white')
    sheet.save(CASE/'test-inputs-overview.jpg',quality=92)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path,default=CASE/'source.png')
    asyncio.run(prepare(parser.parse_args().source))
