# See-through 本地切片完整工具链

本工具链检查并安装固定版本的 ComfyUI、ComfyUI-See-through、独立 Python 环境和模型，
然后通过一个命令把指定原画切成 RGBA 部件及深度图，并复制到指定输出目录。

支持入口：

- Windows 10/11 + NVIDIA CUDA：PowerShell 7。
- macOS + Apple Silicon MPS：bash/zsh。macOS 安装和参数链路由自动测试覆盖；完整模型推理仍应在目标 Mac 上执行一次 smoke test 后再用于生产。

## 目录和版本安全

- 未找到 ComfyUI 时，安装器会克隆到指定的 `ComfyRoot` 并切到仓库锁定的提交。
- 已存在有效 ComfyUI 时只复用，不强制切换或覆盖用户提交。
- 未找到 See-through 插件时自动克隆；已存在插件时检查工作区，并切到锁定提交。
- Python 包安装在 `<ComfyRoot>/.venv-seethrough`，不污染原 ComfyUI venv。
- 模型安装在 `<ComfyRoot>/models/SeeThrough`，权重不会进入 SpineTools Git 仓库。

## Windows 安装

安装器会检查 `git` 和 `uv`；缺失时使用 `winget` 安装。已有 ComfyUI 可以直接指定其目录。

```powershell
pwsh -NoProfile -File .\scripts\seethrough\Install.ps1 `
  -ComfyRoot D:\AI\ComfyUI `
  -DownloadModels
```

可选参数：

| 参数 | 说明 |
|---|---|
| `-ComfyRoot` | ComfyUI目标或已有目录；默认 `$env:COMFYUI_ROOT`，否则 `$HOME\ComfyUI` |
| `-VenvRoot` | 独立运行环境；默认 `<ComfyRoot>\.venv-seethrough` |
| `-DownloadModels` | 下载锁定的 LayerDiff、Marigold和辅助文件 |
| `-HfEndpoint` | 可选Hugging Face镜像，例如 `https://hf-mirror.com` |
| `-ForceModels` | 强制重新下载模型 |
| `-SkipPluginCheckout` | 保留现有插件提交，只安装依赖 |
| `-SkipPrerequisiteInstall` | 缺少git/uv时直接报错，不调用winget |
| `-DryRun` | 只输出安装计划，不修改环境 |

## macOS 安装

`install.sh` 会通过 Homebrew安装缺少的git/uv；没有Homebrew时，uv使用官方安装脚本。
macOS不安装bitsandbytes，使用 `quant_mode=none` 和Apple MPS。

```bash
chmod +x ./scripts/seethrough/install.sh ./scripts/seethrough/generate.sh

./scripts/seethrough/install.sh \
  --comfy-root "$HOME/ComfyUI" \
  --download-models
```

使用Hugging Face镜像：

```bash
./scripts/seethrough/install.sh \
  --comfy-root "$HOME/ComfyUI" \
  --download-models \
  --hf-endpoint https://hf-mirror.com
```

## Windows生成

```powershell
pwsh -NoProfile -File .\scripts\seethrough\Generate.ps1 `
  -ComfyRoot D:\AI\ComfyUI `
  -InputImage "D:\art\zhaoyun.png" `
  -OutputDirectory "D:\exports\zhaoyun" `
  -OutputPrefix "zhaoyun" `
  -OutputArchive "D:\exports\zhaoyun.zip" `
  -Resolution 1024 `
  -DepthResolution 720 `
  -Steps 30 `
  -Seed 42 `
  -AlphaMode preserve
```

## macOS生成

```bash
./scripts/seethrough/generate.sh \
  --comfy-root "$HOME/ComfyUI" \
  --input "$HOME/art/zhaoyun.png" \
  --output-dir "$HOME/exports/zhaoyun" \
  --output-prefix zhaoyun \
  --archive "$HOME/exports/zhaoyun.zip" \
  --resolution 1024 \
  --depth-resolution 720 \
  --steps 30 \
  --seed 42 \
  --alpha-mode preserve
```

macOS的 `--group-offload auto` 会自动解析为关闭，因为插件的group-offload实现以CUDA为目标。

## 生成参数

| Windows | macOS/Python | 默认值 | 范围/说明 |
|---|---|---:|---|
| `-InputImage` | `--input` | 必填 | 原画PNG/JPEG/WebP；透明PNG建议使用preserve |
| `-OutputDirectory` | `--output-dir` | 必填 | 所有部件、深度图、JSON、报告的目录 |
| `-OutputPrefix` | `--output-prefix` | `seethrough` | 输出文件前缀；非法字符会转成下划线 |
| `-OutputArchive` | `--archive` | 空 | 可选的精确ZIP输出路径 |
| `-Resolution` | `--resolution` | 1024 | 512–2048，LayerDiff方形画布 |
| `-DepthResolution` | `--depth-resolution` | 720 | `-1`或64–2048；`-1`跟随Resolution |
| `-Steps` | `--steps` | 30 | 1–100；4仅用于链路测试，30制作，40–50终稿 |
| `-Seed` | `--seed` | 42 | 0–4294967295；影响语义分片和重绘结果 |
| `-AlphaMode` | `--alpha-mode` | `preserve` | `preserve`或`opaque` |
| `-QuantMode` | `--quant-mode` | `none` | `none`或`nf4`；NF4仅支持CUDA环境 |
| `-GroupOffload` | `--group-offload` | `auto` | `auto/on/off`；CUDA自动开，MPS自动关 |
| `-TblrSplit` | `--tblr-split` / `--no-tblr-split` | 开 | 拆分左右手套、眼睛、眉毛等对称部件 |
| `-UseLama` | `--use-lama` / `--no-use-lama` | 关 | 对通用hair层使用LaMa补全；可能触发额外模型需求 |
| `-Port` | `--port` | 8188 | ComfyUI API端口 |
| `-InferenceTimeout` | `--inference-timeout` | 3600秒 | 高分辨率/高步数时可提高 |
| `-IgnoreVramGuard` | `--ignore-vram-guard` | 关 | 仅跳过CUDA显存门槛，不降低实际显存需求 |
| `-KeepServer` | `--keep-server` | 关 | 生成结束后保留本次启动的ComfyUI |
| `-SkipDiagnose` | `--skip-diagnose` | 关 | 跳过模型和版本诊断，不建议生产使用 |

## 输出内容

指定输出目录中包含：

- `<prefix>_*_<part>.png`：裁切后的RGBA部件。
- `<prefix>_*_<part>_depth.png`：部件深度图。
- `<prefix>_*_layers.json`：画布、坐标、深度中位数和文件映射。
- `<prefix>_*_source.png`：本次原画副本。
- `run_report.json`：输入、参数、输出文件列表和ComfyUI prompt ID。
- `environment.json`：Python、PyTorch、加速器、插件和模型版本诊断。
- `logs/`：工具本次自行启动ComfyUI时的标准输出和错误日志。
- 可选ZIP：由 `OutputArchive/--archive` 指定精确路径。

ComfyUI自己的 `output` 仍保留原始生成文件；指定输出目录是本工具链整理后的可交付副本。

## 推荐参数路线

- 链路验证：`512 / depth 384 / 4 steps`。
- Seed初筛：`768 / depth 512 / 20–30 steps`。
- 制作：`1024 / depth 720 / 30–40 steps`。
- 最终对照：`1024 / depth 720 / 50 steps`。

RTX 3060 12GB的 `1024/720/50` 实测整卡峰值约10.3GB；高于1024应先降低其他GPU占用或验证NF4。
增加Steps或Resolution无法修复固定语义标签把头盔识别为hair的问题，遇到此类错误应进入蒙版/图层编辑器纠偏。

## 诊断和复核

生成命令默认先执行完整诊断。也可以单独运行：

```powershell
pwsh -File .\scripts\seethrough\Diagnose.ps1 -ComfyRoot D:\AI\ComfyUI -RequireModels
```

部件总览和重组差异：

```powershell
pwsh -File .\scripts\seethrough\New-LayerContactSheet.ps1 `
  -LayerJson D:\exports\zhaoyun\<prefix>_layers.json `
  -OutputPath D:\exports\zhaoyun\contact_sheet.png

H:\ComfyUI\.venv-seethrough\Scripts\python.exe `
  .\scripts\seethrough\reconstruct_layers.py `
  --layer-json D:\exports\zhaoyun\<prefix>_layers.json `
  --source D:\art\zhaoyun.png `
  --output-dir D:\exports\zhaoyun\reconstruction
```

## 维护边界

- Windows CUDA环境有本仓库锁定依赖和RTX 3060完整推理记录。
- macOS安装、参数传递、MPS诊断和CUDA开关隔离由自动测试覆盖，但本仓库当前没有Mac硬件上的完整模型推理报告。
- See-through模型使用固定语义标签，不接受自由文本Prompt。
- Marigold模型页当前未声明明确许可证；商用或重新分发前需单独确认。
