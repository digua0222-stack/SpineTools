"""Download the official ComfyUI example inpainting checkpoint, with SHA256 verification."""
import argparse,hashlib,shutil,time
from pathlib import Path
from urllib.request import urlopen
NAME='512-inpainting-ema.safetensors'
REVISION='a3feb9bf86e1b98445d6217d517d4217b75313aa'
SHA256='b29e2ed9a8fe58e76f7e801bda091d23738bd74c1da3f339bcbe2d40922fcb60'
SIZE=5214662094
URL=f'https://huggingface.co/Comfy-Org/stable_diffusion_2.1_repackaged/resolve/{REVISION}/{NAME}'
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
    return h.hexdigest()
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--comfy-root',type=Path,required=True);a=p.parse_args()
    if not (a.comfy_root/'main.py').is_file():p.error('--comfy-root must point to an existing ComfyUI checkout')
    folder=a.comfy_root/'models/checkpoints';folder.mkdir(parents=True,exist_ok=True);target=folder/NAME
    if target.exists():
        if digest(target)!=SHA256:raise SystemExit('Existing checkpoint differs; move it aside explicitly before downloading')
        print('Checkpoint already present and verified');return
    if shutil.disk_usage(folder).free<SIZE+1024**3:raise SystemExit('Insufficient disk space; reserve at least 6.3 GB')
    partial=folder/(NAME+'.SpineTools.part');count=0;last=time.monotonic();h=hashlib.sha256()
    print(f'Downloading {SIZE/1e9:.2f} GB from the official Comfy-Org repository',flush=True)
    with urlopen(URL,timeout=120) as response,partial.open('wb') as f:
        while chunk:=response.read(8*1024*1024):
            f.write(chunk);h.update(chunk);count+=len(chunk)
            if time.monotonic()-last>10:print(f'{count/SIZE:.1%}',flush=True);last=time.monotonic()
    if count!=SIZE or h.hexdigest()!=SHA256:raise SystemExit('Size/SHA256 mismatch; partial file was not promoted')
    partial.replace(target);print(f'Verified: {target}',flush=True)
if __name__=='__main__':main()
