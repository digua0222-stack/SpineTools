"""Regression checks for source/region protection and ComfyUI subfolder uploads."""
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('comfy_inpaint_run', ROOT / 'scripts/comfy_inpaint/run.py')
RUN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUN)
CASE = ROOT / 'examples/comfy-inpaint/zhaoyun-v2'


class ProtectionTests(unittest.TestCase):
    def test_different_source_is_rejected_before_execution(self):
        with tempfile.TemporaryDirectory(prefix='spinetools-inpaint-test-') as temp:
            case = Path(temp) / 'case'
            shutil.copytree(CASE, case)
            with (case / 'source.png').open('ab') as handle:
                handle.write(b'different source')
            with self.assertRaisesRegex(ValueError, 'Source hash changed'):
                RUN.validate_case(case)

    def test_edit_cannot_overwrite_known_region_even_with_new_file_hash(self):
        with tempfile.TemporaryDirectory(prefix='spinetools-inpaint-test-') as temp:
            case = Path(temp) / 'case'
            shutil.copytree(CASE, case)
            manifest = json.loads((case / 'manifest.json').read_text(encoding='utf-8'))
            task = manifest['tasks'][0]
            folder = case / 'tasks' / task['id']
            with Image.open(folder / 'keep-mask.png') as keep:
                pixel = next((x, y) for y in range(keep.height) for x in range(keep.width)
                             if keep.convert('L').getpixel((x, y)) == 255)
            with Image.open(folder / 'mask.png') as source:
                mask = source.convert('L')
            mask.putpixel(pixel, 255)
            mask.save(folder / 'mask.png')
            task['files']['mask.png'] = RUN.sha(folder / 'mask.png')
            RUN.write_json(case / 'manifest.json', manifest)
            with self.assertRaisesRegex(ValueError, 'Edit and keep masks overlap'):
                RUN.validate_case(case)

    def test_subfolder_images_are_valid_but_missing_checkpoints_are_not(self):
        graph = {'1': {'class_type': 'LoadImage', 'inputs': {'image': 'uploaded/case/input.png'}}}
        info = {'LoadImage': {'input': {'required': {'image': [['root-image.png']]}}, 'output': ['IMAGE', 'MASK']}}
        RUN.validate_graph(graph, info)
        graph['2'] = {'class_type': 'CheckpointLoaderSimple', 'inputs': {'ckpt_name': 'missing.safetensors'}}
        info['CheckpointLoaderSimple'] = {'input': {'required': {'ckpt_name': [['installed.safetensors']]}}, 'output': ['MODEL', 'CLIP', 'VAE']}
        with self.assertRaisesRegex(ValueError, 'unavailable on this server'):
            RUN.validate_graph(graph, info)


if __name__ == '__main__':
    unittest.main()
