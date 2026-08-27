# See-through 本地切片完整工具链

本工具链检查并安装固定版本的 ComfyUI、ComfyUI-See-through、独立 Python 环境和模型，
然后通过一个命令把指定原画切成 RGBA 部件及深度图，并复制到指定输出目录。

支持入口：

- Windows 10/11 + NVIDIA CUDA：PowerShell 7。
- Linux x86_64 + NVIDIA CUDA：bash；H20/驱动535实测使用cu121兼容栈。
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

## 赵云一键测试

仓库包含标准透明测试输入`examples/seethrough/zhaoyun.png`。以下入口会串联安装器与生成器：首次运行自动检查或安装ComfyUI、固定提交的See-through、独立Python环境和全部模型，然后执行诊断、切片、指定目录导出及重组对比。

Windows：

```powershell
pwsh -NoProfile -File .\scripts\seethrough\Test-ZhaoYun.ps1
```

## Linux 安装

Linux 安装器支持 apt、dnf 和 yum，会补齐 OpenCV 所需的 `libGL.so.1`，并使用独立的
Python 3.12/cu121 运行时：

```bash
chmod +x ./scripts/seethrough/install-linux.sh ./scripts/seethrough/generate.sh

./scripts/seethrough/install-linux.sh \
  --comfy-root /opt/seethrough/ComfyUI \
  --venv-root /opt/seethrough/venv \
  --download-models
```

H20 的实测参数、BF16 兼容补丁和实例回收前归档策略见
[Linux/H20 实测复盘](SEETHROUGH_LINUX_H20_RUNBOOK.zh-CN.md)。

macOS：

```bash
./scripts/seethrough/test-zhaoyun.sh
```

默认使用`pilot`预设，适合新机器首次验证：

| 预设 | Resolution | DepthResolution | Steps | 用途 |
|---|---:|---:|---:|---|
| `pilot` | 512 | 384 | 4 | 快速确认安装、模型和输出链路 |
| `screen` | 768 | 512 | 12 | 多Seed低成本初筛 |
| `quality` | 1024 | 720 | 40 | 入选Seed的终稿候选 |

`pilot`只验证安装和数据链路，1–4步生成的图层不能用于评价最终画质。Windows/NVIDIA首次测试若提示空闲显存不足，应优先关闭占用GPU的软件；仅做链路排障时可以组合`-QuantMode nf4 -IgnoreVramGuard`降低权重显存并跳过安全门槛，但NF4不应替代质量档的`QuantMode=none`。

Windows质量档示例：

```powershell
pwsh -NoProfile -File .\scripts\seethrough\Test-ZhaoYun.ps1 `
  -ComfyRoot H:\ComfyUI `
  -OutputDirectory H:\exports\zhaoyun-quality `
  -Preset quality `
  -Seed 42
```

macOS初筛档示例：

```bash
./scripts/seethrough/test-zhaoyun.sh \
  --comfy-root "$HOME/ComfyUI" \
  --output-dir "$HOME/exports/zhaoyun-screen" \
  --preset screen \
  --seed 42
```

预设只是默认参数组合，仍可用`Resolution/DepthResolution/Steps/Seed/AlphaMode/QuantMode/GroupOffload/TblrSplit/UseLama`对应的命令行参数逐项覆盖。`SkipInstall/--skip-install`复用已准备环境；`ForceModels/--force-models`重新下载模型；`HfEndpoint/--hf-endpoint`指定Hugging Face镜像；`DryRun/--dry-run`只验证下载与运行计划，不启动推理。

Windows输出中还包含`contact_sheet.png`；两个平台都会生成`reconstruction/comparison.png`、`reconstruction/metrics.json`和`reconstruction/quality_report.json`。默认输出目录是仓库下的`output/zhaoyun-seethrough`，该目录已加入Git忽略。

### 单机显卡报告与自动推荐

Windows：

```powershell
pwsh -NoProfile -File .\scripts\seethrough\Get-HardwareRecommendation.ps1 `
  -JsonOut .\output\hardware_report.json
```

macOS：

```bash
./scripts/seethrough/recommend-hardware.sh \
  --json-out ./output/hardware_report.json
```

报告打印操作系统、CPU、系统内存、GPU型号、驱动、CUDA计算能力、总/空闲/已用显存、利用率、温度与功耗，并为`pilot/screen/quality`分别给出参数和可复制命令。Windows存在多张NVIDIA显卡时可使用`-GpuIndex`选择报告目标。

推荐同时考虑两个维度：

- 总显存决定硬件能力档：低于8GB不支持；8GB以512为主；10GB推荐768；12GB推荐实测的1024/720/50；16GB保持1024并提高深度；24GB以上推荐1280。
- 当前空闲显存决定能否立即执行。即使12GB显卡支持quality档，如果当前空闲显存低于安全门槛，报告仍会标记`not-ready`并要求先关闭GPU进程。

Apple Silicon没有独立显存，报告根据统一内存给出保守MPS建议，并始终使用`QuantMode=none`和`GroupOffload=off`。由于当前仓库没有实体Mac完整推理记录，MPS建议是容量规划起点，不是性能承诺。

赵云一键测试会自动把同一份报告写入输出目录的`hardware_report.json`，便于连同`run_report.json`和`environment.json`归档。

## 生成参数

| Windows | macOS/Python | 默认值 | 范围/说明 |
|---|---|---:|---|
| `-InputImage` | `--input` | 必填 | 原画PNG/JPEG/WebP；透明PNG建议使用preserve |
| `-OutputDirectory` | `--output-dir` | 必填 | 所有部件、深度图、JSON、报告的目录 |
| `-OutputPrefix` | `--output-prefix` | `seethrough` | 输出文件前缀；非法字符会转成下划线 |
| `-OutputArchive` | `--archive` | 空 | 可选的精确ZIP输出路径 |
| `-Resolution` | `--resolution` | 1024 | 512–2048，LayerDiff方形画布 |
| `-DepthResolution` | `--depth-resolution` | 720 | `-1`或64–2048；`-1`跟随Resolution |
| `-Steps` | `--steps` | 30 | 1–100；4仅用于链路测试，12初筛，30制作，40–50终稿 |
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

## 质量参数详解

参数不能同时等价为“画质”。边界清晰度、部件完整性、RGBA部件的像素尺寸和前后遮挡顺序，分别由不同阶段决定。

| 参数 | 边界清晰度 | 拆图漏件 | RGBA部件分辨率 | 深度/层级 | 质量优先建议 |
|---|---:|---:|---:|---:|---|
| `Resolution` | 明显影响 | 小幅但不稳定 | 直接影响 | 间接影响 | RTX 3060使用1024；显存允许再试1280 |
| `DepthResolution` | 基本不影响 | 基本不影响 | 不影响 | 直接影响 | 720；层级有问题时尝试`-1`跟随Resolution |
| `Steps` | 30前较明显，之后递减 | 不保证 | 不影响 | 不影响 | 初筛20–30，终稿40–50 |
| `Seed` | 结果可能变化 | 明显影响单次结果 | 不影响 | 结果可能变化 | 同参数跑4–8个Seed并择优 |
| `AlphaMode` | 透明原图时关键 | 可保留细小轮廓 | 不影响 | 不影响 | 有Alpha的PNG固定使用`preserve` |
| `QuantMode` | `nf4`可能有轻微精度损失 | 轻微/不稳定 | 不影响 | 不影响 | 质量优先`none`；显存不足才试`nf4` |
| `GroupOffload` | 不影响 | 不影响 | 不影响 | 不影响 | CUDA使用`auto/on`，它只改变显存和速度 |
| `TblrSplit` | 不改善原始蒙版 | 只拆指定对称部件 | 不影响 | 可增加独立部件 | Spine绑定通常保持开启 |
| `UseLama` | 只可能改善特定hair补全 | 不改善通用漏件 | 不影响 | 不影响 | 当前v3前/后发标签下收益有限，默认关闭 |

### Resolution

`Resolution`是LayerDiff实际使用的正方形画布边长，保存的JSON画布也是该尺寸；裁切后的RGBA部件保留这套坐标尺度。因此它是当前参数中唯一能够直接提高部件像素尺寸的参数。

- `512`：只适合链路验证或快速Seed排雷。
- `768`：Seed初筛，成本和可辨识度较平衡。
- `1024`：RTX 3060 12GB已验证的终稿档。
- `1280`：显存挑战档，应先关闭占用GPU的软件并只跑一个Seed验证。
- `2048`：接口允许的理论上限，不代表本机可运行，也不会为低分辨率原画凭空恢复真实细节。

输入会先等比缩放并居中补成正方形。长枪、翅膀等横向物体会让人物主体在画布中占比变小。若目标是人物骨骼部件，先将人物与长武器分别紧裁、分别切片，通常比把Resolution从1024强行提高到2048更有效。

### DepthResolution

该参数只控制Marigold深度推理，主要影响部件的前后排序和遮挡聚类，不会让RGBA边缘更清晰，也不会提高RGBA文件尺寸。

- `720`是当前机器的实用默认值。
- `-1`表示与`Resolution`相同，适合前后层级明显错误时进行最终验证。
- 如果主要问题是鞋子、披风或头盔没有被识别，提高DepthResolution通常无效。

### Steps

Steps是LayerDiff去噪步数，不是清晰度倍数。30步以前通常有实际收益，40–50适合终稿；继续提高到60–100会显著增加耗时，但无法保证边界更准或部件更完整，也可能让重绘内容发生漂移。

### Seed

Seed是随机生成轨迹的编号，不存在“越大越好”。相同输入、模型、Resolution、Steps和Seed用于复现同一组条件；更换Seed相当于重新采样一次拆分方案。它是解决单次漏件成本最低的手段之一，但不能突破模型固定语义标签。

改变Resolution或Steps后，即使保持同一Seed，采样轨迹和结果也可能改变。因此初筛结果只能用于缩小候选范围，终稿参数下仍需再次确认。

#### 技术原理

See-through不是直接按像素颜色执行确定性的连通域切割。LayerDiff会在给定原图和固定语义标签的条件下，从随机潜变量开始进行扩散去噪，逐步预测每个语义层的RGB和Alpha。可以简化为：

```text
随机潜变量 zT = RandomNormal(shape, seed)
z(t-1) = Denoise(model, zt, source_image, fixed_tags, timestep)
RGBA_layers = Decode(z0)
```

Seed控制的是伪随机数生成器的初始状态，从而控制第一步随机潜变量`zT`。模型权重、原图和标签不变时，不同Seed会从不同的初始噪声位置出发；后续去噪路径随之变化，最终可能产生不同的部件Alpha、遮挡补画和标签归属。

在本工具链锁定的ComfyUI-See-through提交`98d754bf04f668647919ab750eccb0e0640faa81`中，Seed按以下方式生效：

1. 插件调用`random.seed(seed)`、`numpy.random.seed(seed)`、`torch.manual_seed(seed)`和`torch.cuda.manual_seed_all(seed)`，固定Python、NumPy、PyTorch CPU及CUDA的全局随机状态。
2. LayerDiff另外创建当前设备上的`torch.Generator`并调用`manual_seed(seed)`。
3. 扩散管线使用该生成器创建正态分布初始噪声；同一组语义帧共享扩展后的基础噪声，使身体标签之间保持空间相关，而不是让每个标签完全独立随机。
4. v3流程先生成身体标签组，再从身体结果中的`head`蒙版计算头部裁切范围，随后继续使用已经消耗过状态的同一个生成器生成头部标签组。因此Seed不仅直接影响头部噪声，还会先改变身体阶段的头部蒙版，再间接改变头部裁切与面部分片。
5. 深度阶段再次用同一Seed重置全局随机状态。Marigold从随机深度潜变量开始去噪，因此Seed也可能影响深度估计和最终图层顺序。
6. 左右拆分、连通域裁切和JSON导出主要是生成后的确定性后处理；它们会放大上游蒙版差异，但自身不是多Seed搜索的主要随机来源。

这解释了为什么更换Seed可能让`footwear`从空层变为非空层，或者让同一块头盔在`headwear`和hair之间改变归属：Seed没有改变标签列表，而是改变了固定标签条件下的概率采样结果。生成结果中低于插件Alpha阈值的区域会在后处理中被清除，因此轻微的概率差异也可能表现为整个部件“出现”或“消失”。

#### Seed不是什么

- Seed不是质量分数，`8192`不比`42`更清晰，也不存在公认的“最佳Seed”。
- Seed不是训练参数，不会改变模型权重或让模型学习赵云。
- Seed不会增加新的语义标签，不能从根本上解决模型没有肩甲、膝甲等专用标签的问题。
- Seed不是连续的风格旋钮；相邻的`42`和`43`通常也会得到明显不同的随机轨迹。
- Seed不会提高输出像素尺寸；部件尺寸由`Resolution`决定。

#### 可复现性的边界

在输入文件内容、模型权重、插件提交、参数、运行设备和软件依赖都相同的前提下，同一Seed应得到相同或非常接近的结果。但当前插件没有强制PyTorch全局确定性算法，因此不要把Seed理解为跨平台的逐像素一致保证。

以下任一变化都可能使同一Seed产生不同结果：

- 改变`Resolution`会改变随机张量形状及像素坐标尺度。
- 改变`Steps`会改变调度器时间步和去噪调用次数。
- 改变输入Alpha、裁切范围或源图片字节。
- 改变模型、插件提交、PyTorch、CUDA/MPS、数据精度或量化模式。
- 在Windows CUDA和macOS MPS之间切换；不同算子实现和浮点舍入不能保证位级一致。

`GroupOffload`原则上只改变模型驻留位置和显存占用，不应有意改变采样逻辑；但生产复现仍建议连同完整`run_report.json`、`environment.json`和模型版本一起归档，而不是只记录Seed。

#### 为什么要多Seed初筛

从概率角度看，多Seed是在相同条件分布下取得多个独立候选：

```text
candidate_i ~ P(layers | source_image, fixed_tags, model, parameters, seed_i)
```

它的目标不是对Seed求平均，也不是寻找数值最大的Seed，而是以可控成本扩大候选集合，再按部件完整度、语义正确性和可绑定性选择较优样本。它对偶发漏件有效，但对所有Seed都重复出现的系统性错误帮助有限；后者通常需要紧裁/分对象输入、组合不同候选部件或人工蒙版纠偏。

### AlphaMode和边界限制

透明PNG使用`preserve`时，原图Alpha会进入工作流；使用`opaque`会把整张矩形画布视为不透明输入。`preserve`只能保留已有Alpha，不能自动把JPEG或黑底图变成透明图。

当前命令尚未暴露Alpha阈值、碎片面积、孔洞闭合、边缘羽化和像素风最近邻放大等后处理参数。Resolution可以提高边缘采样密度，但不能把软边自动变为像素硬边；这类效果应在切片后通过蒙版/图层编辑器处理。

### 不能靠参数解决的问题

当前v3模型使用固定标签，例如`topwear`、`legwear`、`footwear`、`headwear`、`front hair`、`back hair`和`objects`。肩甲、膝甲、披风等不会因为Steps提高就自动获得新的专用语义标签。下列情况应使用多Seed挑选、分对象输入或人工蒙版纠偏：

- 头盔被分到hair。
- 鞋子或被遮挡的肢体完全漏失。
- 披风、胸甲和裙甲被合并到同一层。
- 模型补画出的遮挡区域与原角色设计不一致。

## 多Seed初筛

是的，多Seed初筛就是固定除Seed外的所有条件，用不同Seed独立运行多轮，然后比较产物。建议先跑4个Seed；若没有可用候选，再扩展到8个，而不是一开始用1024/50跑满全部Seed。

推荐两阶段流程：

1. 初筛：`768 / depth 512 / 12 steps`，Seed使用`7、23、42、88`。
2. 扩展：前4个都不合格时，再增加`137、2026、3407、8192`。
3. 每个Seed使用独立输出目录，不要互相覆盖。
4. 检查必需部件是否存在、语义是否正确、边缘是否残缺，并查看重组图。
5. 选出前1–2个Seed，以`1024 / depth 720 / 40 steps`分别复跑。
6. 若终稿复跑发生退化，使用下一候选Seed；必要时组合不同Seed中质量最好的部件。

Windows批量初筛：

```powershell
$inputImage = "D:\art\zhaoyun.png"
$outputRoot = "D:\exports\zhaoyun-seed-screen"
$seeds = @(7, 23, 42, 88)

foreach ($seed in $seeds) {
  pwsh -NoProfile -File .\scripts\seethrough\Generate.ps1 `
    -ComfyRoot D:\AI\ComfyUI `
    -InputImage $inputImage `
    -OutputDirectory (Join-Path $outputRoot "seed-$seed") `
    -OutputPrefix "zhaoyun_seed_$seed" `
    -Resolution 768 `
    -DepthResolution 512 `
    -Steps 12 `
    -Seed $seed `
    -AlphaMode preserve `
    -QuantMode none `
    -GroupOffload auto `
    -TblrSplit $true
}
```

macOS批量初筛：

```bash
input_image="$HOME/art/zhaoyun.png"
output_root="$HOME/exports/zhaoyun-seed-screen"

for seed in 7 23 42 88; do
  ./scripts/seethrough/generate.sh \
    --comfy-root "$HOME/ComfyUI" \
    --input "$input_image" \
    --output-dir "$output_root/seed-$seed" \
    --output-prefix "zhaoyun_seed_$seed" \
    --resolution 768 \
    --depth-resolution 512 \
    --steps 12 \
    --seed "$seed" \
    --alpha-mode preserve \
    --quant-mode none \
    --group-offload auto \
    --tblr-split
done
```

初筛不是简单选择“部件数量最多”的结果。更多部件也可能代表误拆或碎片噪声。优先按以下顺序判断：

1. Spine必需部件是否齐全，例如躯干、左右手臂/手、左右腿/脚、头脸、头饰和武器。
2. 语义是否正确，例如头盔没有混入头发、长枪没有混入手臂。
3. 拼回整体后是否漏轮廓、错层或出现明显色差。
4. 边缘和被遮挡区域是否足以支持旋转，不要求单张静态重组图完全无差异。

每轮生成后，可以用本文“诊断和复核”中的部件总览图与重组脚本复核。`Alpha IoU/Recall`可用于发现轮廓漏失，但它只能作为辅助指标，不能判断图层语义是否正确。

## 输出内容

指定输出目录中包含：

- `<prefix>_*_<part>.png`：裁切后的RGBA部件。
- `<prefix>_*_<part>_depth.png`：部件深度图。
- `<prefix>_*_layers.json`：画布、坐标、深度中位数和文件映射。
- `<prefix>_*_source.png`：本次原画副本。
- `run_report.json`：输入、参数、输出文件列表和ComfyUI prompt ID。
- `environment.json`：Python、PyTorch、加速器、插件和模型版本诊断。
- `logs/`：工具本次自行启动ComfyUI时的标准输出和错误日志。
- `reconstruction/quality_report.json`：重组指标、语义完整度、异常大层和自动评分。
- 可选ZIP：由 `OutputArchive/--archive` 指定精确路径。

ComfyUI自己的 `output` 仍保留原始生成文件；指定输出目录是本工具链整理后的可交付副本。

## 推荐参数路线

- 链路验证：`512 / depth 384 / 4 steps`。
- Seed初筛：`768 / depth 512 / 20–30 steps`。
- 制作：`1024 / depth 720 / 30–40 steps`。
- 最终对照：`1024 / depth 720 / 50 steps`。

RTX 3060 12GB的 `1024/720/50` 实测整卡峰值约10.3GB；高于1024应先降低其他GPU占用或验证NF4。
增加Steps或Resolution无法修复固定语义标签把头盔识别为hair的问题，遇到此类错误应进入蒙版/图层编辑器纠偏。

本项目对同一赵云输入的实测中，`512/30`保留了`footwear`，而`1024/720/50`反而漏掉`footwear`。高分辨率改善了铠甲、披风、长枪和颜色细节，但不保证语义分片更完整。这也是终稿阶段仍需保留多个Seed候选的原因。

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
- Linux CUDA环境已在TencentOS 3.2、NVIDIA H20 96GB、驱动535.247.01上完成512/384/1与1024/720/30端到端推理；详见[Linux/H20实测复盘](SEETHROUGH_LINUX_H20_RUNBOOK.zh-CN.md)。
- macOS安装、参数传递、MPS诊断和CUDA开关隔离由自动测试覆盖，但本仓库当前没有Mac硬件上的完整模型推理报告。
- See-through模型使用固定语义标签，不接受自由文本Prompt。
- Marigold模型页当前未声明明确许可证；商用或重新分发前需单独确认。
