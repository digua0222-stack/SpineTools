"""Portable ComfyUI inpainting benchmark. No Torch dependency in this client.

Default uses a running local ComfyUI HTTP API. --dry-run is offline;
--transport-smoke exercises real core compositing nodes without a model/GPU.
Neither is reported as diffusion inference or a successful MCP call.
"""
from __future__ import annotations
import argparse, hashlib, json, shutil, time, uuid
from pathlib import Path
from urllib import request, parse, error
from PIL import Image, ImageChops, ImageStat
REPO=Path(__file__).resolve().parents[2]
DEFAULT_CASE=REPO/'examples/comfy-inpaint/zhaoyun-v2'
UPLOADS=['input.png','mask.png','target-alpha.png','reference-native.png','keep-mask-native.png','target-alpha-native.png']

def read_json(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def write_json(path,data):Path(path).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def changed_pixels(a,b,mask=None):
    if a.size!=b.size:raise ValueError(f'Image dimensions differ: {a.size} / {b.size}')
    diff=ImageChops.difference(a.convert('RGB'),b.convert('RGB'))
    r,g,b=diff.split();changed=ImageChops.lighter(ImageChops.lighter(r,g),b).point(lambda v:255 if v else 0)
    if mask is not None:changed=ImageChops.multiply(changed,mask.convert('L'))
    return changed.histogram()[255]

def validate_case(case):
    m=read_json(case/'manifest.json')
    if sha(case/m['source'])!=m['sourceSHA256']:raise ValueError('Source hash changed; review masks again')
    with Image.open(case/m['source']) as source:
        source_rgb=source.convert('RGB')
    if list(source_rgb.size)!=m['sourceSize']:raise ValueError('Source dimensions changed')
    seen=set()
    for t in m['tasks']:
        if t['id'] in seen or not t['id'].replace('_','').isalnum():raise ValueError('Invalid task id')
        seen.add(t['id']);folder=case/'tasks'/t['id']
        for f,h in t['files'].items():
            if Path(f).name!=f or sha(folder/f)!=h:raise ValueError(f'Asset hash mismatch: {t["id"]}/{f}')
        mask=Image.open(folder/'mask.png').convert('L');keep=Image.open(folder/'keep-mask.png').convert('L');target=Image.open(folder/'target-alpha.png').convert('L')
        for image in (mask,keep,target):
            if list(image.size)!=t['modelSize'] or any(image.histogram()[1:255]):raise ValueError('Masks must be same-size binary black/white')
        if not mask.getbbox() or not keep.getbbox():raise ValueError('Empty edit or known region')
        if ImageChops.multiply(mask,keep).getbbox():raise ValueError('Edit and keep masks overlap')
        if ImageChops.difference(ImageChops.lighter(mask,keep),target).getbbox():raise ValueError('Edit + keep must cover the target')
        x0,y0,x1,y1=t['crop'];sw,sh=m['sourceSize']
        if not (0<=x0<x1<=sw and 0<=y0<y1<=sh):raise ValueError('Crop outside source')
        native=Image.open(folder/'reference-native.png').convert('RGB')
        expected=source_rgb.crop(t['crop'])
        if changed_pixels(native,expected):raise ValueError('Native reference no longer matches original source')
        if changed_pixels(Image.open(folder/'input.png'),Image.open(folder/'reference-model.png'),keep):raise ValueError('Input changed protected working pixels')
        for name,model in [('keep-mask-native.png',keep),('target-alpha-native.png',target)]:
            actual=Image.open(folder/name).convert('L')
            if actual.size!=native.size or ImageChops.difference(actual,model.resize(native.size,Image.Resampling.NEAREST)).getbbox():raise ValueError('Native mask mapping changed')
    return m

def asset_names(manifest,task):
    base=f'SpineTools_inpaint/{manifest["sourceSHA256"][:12]}/{task["id"]}'
    return {f:f'{base}/{f}' for f in UPLOADS}

def workflow(m,t,assets,seed,checkpoint,prefix,smoke=False):
    g={}
    def node(n,kind,**inputs):g[str(n)]={'class_type':kind,'inputs':inputs}
    node(2,'LoadImage',image=assets['input.png'])
    node(3,'LoadImageMask',image=assets['mask.png'],channel='red')
    if smoke:
        node(8,'EmptyImage',width=512,height=512,batch_size=1,color=0xC25D45)
    else:
        node(1,'CheckpointLoaderSimple',ckpt_name=checkpoint)
        node(4,'CLIPTextEncode',text=t['prompt'],clip=['1',1])
        node(5,'CLIPTextEncode',text=m['negative'],clip=['1',1])
        node(6,'InpaintModelConditioning',positive=['4',0],negative=['5',0],vae=['1',2],pixels=['2',0],mask=['3',0],noise_mask=True)
        node(7,'KSampler',model=['1',0],positive=['6',0],negative=['6',1],latent_image=['6',2],seed=seed,steps=m['steps'],cfg=m['cfg'],sampler_name=m['sampler'],scheduler=m['scheduler'],denoise=m['denoise'])
        node(8,'VAEDecode',samples=['7',0],vae=['1',2])
    # VAE decode can change unmasked pixels. Restore them with a hard composite.
    node(9,'ImageCompositeMasked',destination=['2',0],source=['8',0],x=0,y=0,resize_source=False,mask=['3',0])
    node(10,'SaveImage',images=['8',0],filename_prefix=prefix+'/raw')
    node(11,'SaveImage',images=['9',0],filename_prefix=prefix+'/composited')
    node(12,'LoadImageMask',image=assets['target-alpha.png'],channel='red')
    # JoinImageWithAlpha expects transparency, so invert the opaque target mask.
    node(13,'InvertMask',mask=['12',0])
    node(14,'JoinImageWithAlpha',image=['9',0],alpha=['13',0])
    node(15,'SaveImage',images=['14',0],filename_prefix=prefix+'/part-working')
    x0,y0,x1,y1=t['crop']
    node(16,'ImageScale',image=['9',0],upscale_method='nearest-exact',width=x1-x0,height=y1-y0,crop='disabled')
    node(17,'LoadImage',image=assets['reference-native.png'])
    node(18,'LoadImageMask',image=assets['keep-mask-native.png'],channel='red')
    # Restore original pixels again at native resolution; model enlargement is not new source detail.
    node(19,'ImageCompositeMasked',destination=['16',0],source=['17',0],x=0,y=0,resize_source=False,mask=['18',0])
    node(20,'LoadImageMask',image=assets['target-alpha-native.png'],channel='red')
    node(21,'InvertMask',mask=['20',0])
    node(22,'JoinImageWithAlpha',image=['19',0],alpha=['21',0])
    node(23,'SaveImage',images=['22',0],filename_prefix=prefix+'/part-native')
    return g

def validate_graph(g,info=None):
    visited=set();active=set()
    def visit(n):
        if n in active:raise ValueError('Workflow cycle')
        if n in visited:return
        active.add(n)
        for v in g[n]['inputs'].values():
            if isinstance(v,list):
                if len(v)!=2 or v[0] not in g or not isinstance(v[1],int) or v[1]<0:raise ValueError('Invalid node link')
                visit(v[0])
        active.remove(n);visited.add(n)
    for n,node in g.items():
        visit(n)
        if info is None:continue
        kind=node['class_type']
        if kind not in info:raise ValueError(f'ComfyUI missing core node: {kind}. Update ComfyUI.')
        schema=info[kind].get('input',{})
        for k in schema.get('required',{}):
            if k not in node['inputs']:raise ValueError(f'{kind}: missing input {k}')
        for k,v in node['inputs'].items():
            entry=schema.get('required',{}).get(k,schema.get('optional',{}).get(k))
            if entry is None:raise ValueError(f'{kind}: unsupported input {k}')
            typ=entry[0]
            if isinstance(v,list):
                outputs=info[g[v[0]]['class_type']].get('output',[])
                if v[1]>=len(outputs) or (isinstance(typ,str) and typ!=outputs[v[1]]):raise ValueError(f'Incompatible link for {kind}.{k}')
            elif kind in ('LoadImage','LoadImageMask') and k=='image':
                # /object_info lists root files only. Uploaded subfolder paths are
                # supported and validated for existence by ComfyUI's /prompt.
                if not isinstance(v,str) or not v:raise ValueError(f'{kind}.image must be a file name')
            elif isinstance(typ,list) and v not in typ:raise ValueError(f'{kind}.{k}: {v!r} is unavailable on this server')

class Client:
    def __init__(self,url):
        if parse.urlparse(url).scheme not in ('http','https'):raise ValueError('Server must be an HTTP(S) ComfyUI URL')
        self.url=url.rstrip('/')
    def request(self,path,data=None,content_type=None,binary=False):
        headers={}
        if data is not None and not isinstance(data,bytes):data=json.dumps(data).encode();content_type='application/json'
        if content_type:headers['Content-Type']=content_type
        try:
            with request.urlopen(request.Request(self.url+path,data=data,headers=headers),timeout=60) as r:
                body=r.read()
                return body if binary else json.loads(body)
        except error.HTTPError as e:
            detail=e.read().decode('utf-8',errors='replace')[:3000]
            raise RuntimeError(f'ComfyUI HTTP {e.code}: {detail}') from e
    def upload(self,path,remote):
        boundary='SpineTools'+uuid.uuid4().hex;subfolder,filename=remote.rsplit('/',1)
        chunks=[]
        for k,v in [('type','input'),('overwrite','true'),('subfolder',subfolder)]:
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{filename}"\r\nContent-Type: image/png\r\n\r\n'.encode()+path.read_bytes()+b'\r\n')
        chunks.append(f'--{boundary}--\r\n'.encode())
        result=self.request('/upload/image',b''.join(chunks),'multipart/form-data; boundary='+boundary)
        return (result.get('subfolder','')+'/'+result['name']).lstrip('/')
    def execute(self,g,timeout):
        start=time.monotonic();response=self.request('/prompt',{'prompt':g,'client_id':uuid.uuid4().hex})
        if response.get('node_errors'):raise RuntimeError(json.dumps(response['node_errors']))
        prompt_id=response.get('prompt_id')
        if not prompt_id:raise RuntimeError(f'No prompt_id: {response}')
        peak=None
        while time.monotonic()-start<timeout:
            history=self.request('/history/'+parse.quote(prompt_id,safe=''))
            entry=history.get(prompt_id)
            if entry:
                status=entry.get('status',{})
                if status.get('status_str')=='error':raise RuntimeError(json.dumps(status))
                if status.get('completed') or entry.get('outputs'):
                    return prompt_id,entry,{'elapsedSeconds':round(time.monotonic()-start,3),'sampledPeakVramUsedBytes':peak}
            try:
                stats=self.request('/system_stats')
                values=[int(d['vram_total'])-int(d['vram_free']) for d in stats.get('devices',[]) if d.get('type') in ('cuda','xpu') and 'vram_free' in d]
                if values:peak=max(peak or 0,max(values))
            except (RuntimeError,error.URLError,TimeoutError):pass
            time.sleep(2)
        raise TimeoutError(f'Prompt {prompt_id} exceeded {timeout}s. Job may still run; inspect this prompt in ComfyUI before resubmitting.')

def evaluate(folder,task,asset_dir):
    source=Image.open(asset_dir/'input.png').convert('RGB');mask=Image.open(asset_dir/'mask.png').convert('L')
    raw=Image.open(folder/'raw.png').convert('RGB');composite=Image.open(folder/'composited.png').convert('RGB')
    working=Image.open(folder/'part-working.png').convert('RGBA');native=Image.open(folder/'part-native.png').convert('RGBA')
    keep_native=Image.open(asset_dir/'keep-mask-native.png').convert('L');target=Image.open(asset_dir/'target-alpha.png').convert('L');target_native=Image.open(asset_dir/'target-alpha-native.png').convert('L')
    outside=ImageChops.invert(mask)
    result=dict(rawOutsideMaskChangedPixels=changed_pixels(source,raw,outside),protectedWorkingPixelsChanged=changed_pixels(source,composite,outside),
                protectedNativePixelsChanged=changed_pixels(native,Image.open(asset_dir/'reference-native.png'),keep_native),
                editMeanAbsoluteChange=sum(ImageStat.Stat(ImageChops.difference(source,composite),mask).mean)/3,
                workingAlphaMatchesTarget=working.size==target.size and not ImageChops.difference(working.getchannel('A'),target).getbbox(),
                nativeAlphaMatchesTarget=native.size==target_native.size and not ImageChops.difference(native.getchannel('A'),target_native).getbbox(),
                visualQualityAccepted=None,spineMotionAccepted=None)
    if task['purpose']=='known_texture_control':
        truth=Image.open(asset_dir/'ground-truth.png').convert('RGB')
        result['controlMaskedRGB_MAE']=sum(ImageStat.Stat(ImageChops.difference(composite,truth),mask).mean)/3
    result['integrityPassed']=not result['protectedWorkingPixelsChanged'] and not result['protectedNativePixelsChanged'] and result['workingAlphaMatchesTarget'] and result['nativeAlphaMatchesTarget']
    if not result['integrityPassed']:raise ValueError(f'Pixel/alpha integrity failed: {result}')
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--case',type=Path,default=DEFAULT_CASE);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--server',default='http://127.0.0.1:8188');p.add_argument('--checkpoint')
    p.add_argument('--tasks',help='Comma-separated task ids; default all');p.add_argument('--seeds',help='Comma-separated integers')
    p.add_argument('--dry-run',action='store_true');p.add_argument('--preflight-only',action='store_true');p.add_argument('--transport-smoke',action='store_true')
    p.add_argument('--comfy-input',type=Path,help='Stage input files into this ComfyUI input directory, useful with --dry-run/MCP')
    p.add_argument('--timeout',type=float,default=1200);p.add_argument('--steps',type=int);p.add_argument('--denoise',type=float)
    args=p.parse_args();case=args.case.resolve();m=validate_case(case)
    if args.steps is not None:
        if not 1<=args.steps<=10000:p.error('--steps must be 1..10000')
        m['steps']=args.steps
    if args.denoise is not None:
        if not 0<args.denoise<=1:p.error('--denoise must be in (0,1]')
        m['denoise']=args.denoise
    if args.timeout<=0:p.error('--timeout must be positive')
    ids=args.tasks.split(',') if args.tasks else [t['id'] for t in m['tasks']]
    if set(ids)-{t['id'] for t in m['tasks']}:p.error('Unknown task id')
    tasks=[t for t in m['tasks'] if t['id'] in ids]
    seeds=[int(v) for v in args.seeds.split(',')] if args.seeds else m['seeds']
    if not seeds or any(s<0 or s>2**64-1 for s in seeds) or len(set(seeds))!=len(seeds):p.error('Seeds must be distinct unsigned 64-bit integers')
    if args.transport_smoke:seeds=seeds[:1]
    if args.output.exists() and any(args.output.iterdir()):p.error('Output directory must be new/empty; use a separate run directory')
    args.output.mkdir(parents=True,exist_ok=True)
    checkpoint=args.checkpoint or m['defaultCheckpoint'];client=None;info=None
    report=dict(sourceSHA256=m['sourceSHA256'],mode='dry_run' if args.dry_run else ('cpu_transport_smoke' if args.transport_smoke else ('preflight' if args.preflight_only else 'inference')),
                transport='ComfyUI HTTP API; not an MCP call',checkpoint=None if args.transport_smoke else checkpoint,gpuInferenceVerified=False,jobs=[],status='running')
    report_path=args.output/'run-report.json';write_json(report_path,report)
    try:
        if not args.dry_run:
            client=Client(args.server);info=client.request('/object_info');report['serverBefore']=client.request('/system_stats')
            if not args.transport_smoke:
                choices=info.get('CheckpointLoaderSimple',{}).get('input',{}).get('required',{}).get('ckpt_name',[[]])[0]
                if checkpoint not in choices:raise ValueError(f'Missing checkpoint {checkpoint!r}; available: {choices}. Download the documented model or use --checkpoint.')
        for t in tasks:
            assets=asset_names(m,t);asset_dir=case/'tasks'/t['id']
            for f,remote in list(assets.items()):
                if args.comfy_input:
                    dest=args.comfy_input/remote;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(asset_dir/f,dest)
                if client and not args.preflight_only:assets[f]=client.upload(asset_dir/f,remote)
            for seed in seeds:
                folder=args.output/f'{t["id"]}-seed-{seed}';folder.mkdir()
                g=workflow(m,t,assets,seed,checkpoint,f'SpineTools/inpaint/{args.output.name}/{t["id"]}-seed-{seed}',args.transport_smoke)
                validate_graph(g,info)
                write_json(folder/'workflow.api.json',g)
                write_json(folder/'placement.json',dict(task=t['id'],sourceSize=m['sourceSize'],crop=t['crop'],pivotImage=t['pivotImage'],nativeFile='part-native.png',partType=t['purpose']))
                item=dict(task=t['id'],seed=seed,modelExecuted=False,integrityPassed=None)
                if client and not args.preflight_only:
                    print(f'Running {t["id"]}, seed {seed}',flush=True)
                    prompt_id,entry,timing=client.execute(g,args.timeout)
                    write_json(folder/'comfy-history.json',entry);item.update(promptId=prompt_id,**timing)
                    for node,name in [('10','raw'),('11','composited'),('15','part-working'),('23','part-native')]:
                        outputs=entry.get('outputs',{}).get(node,{}).get('images',[])
                        if len(outputs)!=1:raise RuntimeError(f'Expected one {name} image; got {outputs}')
                        meta=outputs[0]
                        data=client.request('/view?'+parse.urlencode({k:meta.get(k,'') for k in ('filename','subfolder','type')}),binary=True)
                        (folder/f'{name}.png').write_bytes(data)
                    item.update(evaluate(folder,t,asset_dir));item['modelExecuted']=not args.transport_smoke
                    write_json(folder/'metrics.json',item)
                report['jobs'].append(item);write_json(report_path,report)
        report['status']='completed';report['modelInferenceCompleted']=all(j['modelExecuted'] for j in report['jobs'])
        if report['modelInferenceCompleted']:
            report['gpuInferenceVerified']=any(d.get('type') in ('cuda','xpu','mps') for d in report.get('serverBefore',{}).get('devices',[]))
        report['visualQualityAccepted']=None;report['spineMotionAccepted']=None
        write_json(report_path,report);print(json.dumps({'status':report['status'],'mode':report['mode'],'jobs':len(report['jobs']),'report':str(report_path)},ensure_ascii=False),flush=True)
    except Exception as exc:
        report['status']='failed';report['error']=str(exc);write_json(report_path,report);raise

if __name__=='__main__':main()
