# SpineTools

离线把 PNG 连续帧或规则精灵表转换为 Spine 序列帧动画，不依赖 Spine Editor、Spine CLI 或在线转换网站。

输出内容：

- `<名称>.png`：透明单页图集
- `<名称>.atlas`：Spine atlas 描述
- `<名称>.json`：Spine JSON 骨架和 attachment 时间轴
- `<名称>.zip`：上述三个运行时文件
- `<名称>.gif`：循环动画预览（不放入运行时 ZIP）
- `<名称>.report.json`：尺寸、哈希和逐帧像素校验报告

## 原理

这个方案生成的是“序列帧 Spine”，不是自动骨骼识别：

1. 将连续图片或精灵表单元按顺序读入。
2. 按最大帧宽高建立单元格，以 10 列、2 像素间距打成透明 atlas。
3. 每帧登记为 `frame_0`、`frame_1` 等 atlas region。
4. JSON 中建立一根 `root` 骨骼和一个 `frame` 插槽。
5. attachment 时间轴按照 `1 / FPS` 切换图片，结尾切回第一帧形成循环。

这种方式可以逐像素贴近视频，但不能独立编辑手臂、武器等身体部件。需要 TPos 时，应把生成的 `frame` 插槽和动画时间轴合并进已有骨架。

默认输出行为与 `spine.dawnwindstudio.top` v2.3 的公开导出格式兼容。序列帧转换器是根据公开行为和输出格式编写的独立实现，不包含该网站代码或 Spine 编辑器。Photopea 验证使用可选的官方 Spine Runtime，样例预览保留其许可。

## 环境

- Python 3.10+
- Pillow

```powershell
python -m pip install -r requirements.txt
```

## 单动画转换

```powershell
python .\sequence_to_spine.py `
  --input "G:\path\frames" `
  --glob "frame_*.png" `
  --animation "attack" `
  --fps 12 `
  --name "hero_attack" `
  --spine-version 4.2.43 `
  --output "G:\path\export"
```

图片按文件名中的数字自然排序。为了保持视频中的位移，每张图片应使用相同透明画布和相同角色坐标。如果每帧单独裁边，attachment 居中切换时会产生抖动。

GIF 默认同步生成；如只需要 Spine 运行时文件，可添加 `--no-gif`。多动画配置会为每个动画输出一个 `<名称>__<动画名>.gif`。GIF 采用循环播放，帧时长按累计时间取整，保证总时长尽可能贴近 Spine 时间轴。由于 GIF 只支持单色透明和最多 256 色，它仅用于快速查阅，Spine 图集仍保留完整 RGBA 画质。

支持的 Spine JSON 版本：

- `3.8.75`
- `4.2.43`

## 多动画配置

编辑 [example_config.json](example_config.json)，然后运行：

```powershell
python .\sequence_to_spine.py `
  --config .\example_config.json `
  --output "G:\path\export"
```

每个动画可以使用独立的输入目录、文件匹配规则和 FPS，并支持可选事件：

```json
"event": { "name": "hit", "frame": 9 }
```

事件帧从 1 开始计数。

## 精灵表

当输入是单张图片时，工具会尝试识别等分的横向、纵向或网格精灵表。也可以明确指定：

```powershell
python .\sequence_to_spine.py `
  --input .\attack_sheet.png `
  --sheet-cols 8 `
  --sheet-rows 4 `
  --animation attack `
  --fps 12 `
  --output .\export
```

显式网格必须能够整除图片宽高，全透明单元格会被跳过。

## 验证

```powershell
python -m unittest discover -s tests -v
```

转换器会在每次导出后重新打开 atlas，并逐帧比较图集区域与输入图片；结果记录在 `.report.json` 的 `verification` 字段中。

## 本地 See-through 分层实验

仓库提供 Windows/NVIDIA CUDA、Linux/NVIDIA CUDA 和 macOS/Apple MPS 的本地部署入口，用独立 Python 环境运行
See-through，避免污染现有 ComfyUI。安装器会检测并复用已有 ComfyUI，缺失时自动安装；生成
脚本支持原画、输出目录/ZIP、Resolution、DepthResolution、Steps、Seed、Alpha和高级开关。

```powershell
pwsh -File .\scripts\seethrough\Install.ps1 -ComfyRoot H:\ComfyUI -DownloadModels
```

macOS：

```bash
./scripts/seethrough/install.sh --comfy-root "$HOME/ComfyUI" --download-models
```

Linux/NVIDIA 全新 GPU Docker（默认安装后依次跑 `probe` 和 `balanced`，每次成功立即 tar）：

```bash
./scripts/seethrough/bootstrap-linux.sh \
  --comfy-root /opt/seethrough/ComfyUI \
  --venv-root /opt/seethrough/venv \
  --output-dir /opt/seethrough/output \
  --preset probe,balanced \
  --seed 42
```

全新 Docker 也可以直接使用独立初始化入口。它会安装基础系统包、Clone/更新本仓库，并通过
`nohup` 在后台完成环境部署：

```bash
curl -fsSL \
  https://raw.githubusercontent.com/digua0222-stack/SpineTools/main/scripts/seethrough/init-fresh-docker.sh \
  | bash -s -- --mode install
```

安装并执行一步链路验证可把模式改为 `--mode probe`；直接进行四 Seed 初筛可使用
`--mode screen --seeds 7,23,42,88`。脚本会打印后台 PID、日志和 Session 目录。

多 Seed 初筛可一次提交并自动生成质量排序：

```bash
./scripts/seethrough/bootstrap-linux.sh \
  --preset screen \
  --seeds 7,23,42,88 \
  --run-id h20-screen-4
```

只安装可加 `--install-only`；只跑链路探针可用 `--preset probe`。入口支持 apt 和 dnf/yum，
uv Python 下载卡顿时会在硬超时后自动回退到 Astral 官方 `python-build-standalone` GitHub releases。

完整安装、切片参数和指定输出说明见
[See-through 完整工具链](docs/SEETHROUGH_TOOLCHAIN.zh-CN.md)；底层环境维护细节见
[See-through 本地环境文档](docs/SEETHROUGH_LOCAL_SETUP.zh-CN.md)。See-through 只负责初始语义
分层，不会自动产生 Spine 骨骼、pivot、IK 或可直接使用的动画。

See-through 在赵云铠甲角色上出现高分但缺少实际可绑定部件，因此后续主方案调整为“完整站立图、
SAM 2 人工提示分割、独立骨架/Atlas/Spine JSON 导出及视频动作重定向”。输入不要求 TPos，
首次人工纠偏保存提示后可无头重放。阶段契约、部件命名、坐标系、验收门、赵云验证步骤及
第三方许可证边界见 [SAM + Spine 骨骼动画工具链设计](docs/SAM_SPINE_ANIMATION_PIPELINE_DESIGN.zh-CN.md)。

SAM V2 已有完整站立图可见部件拆分及无头回归入口，见
[SAM 运行手册](docs/SAM_HEADLESS_RUNBOOK.zh-CN.md)；V3 骨架/Atlas/Spine 4.2 导出与
关节旋转验证已并入同一回归。后续补全阶段要求零人工：自动规划补图区、
补绘、选优、动态验收和有限重试；不合格时明确失败，不等待人工修图。实施顺序、12 项任务、
输入输出和验收门见 [SAM 零人工补全任务](docs/SAM_AUTO_COMPLETION_TASKS.zh-CN.md)。
补全模块进度：AC-01（导出像素正确性+哈希校验强化）与 AC-02（补全契约与预检）已完成并有
CPU 测试；AC-03～AC-12 尚未实现。

新用户可以直接使用仓库内置的[赵云测试图片](examples/seethrough/zhaoyun.png)，一条命令完成
ComfyUI、See-through、模型下载、环境诊断、切片和重组验证：

```powershell
pwsh -NoProfile -File .\scripts\seethrough\Test-ZhaoYun.ps1
```

macOS：

```bash
./scripts/seethrough/test-zhaoyun.sh
```

Linux 使用同一个 shell 测试入口；`probe` 是 1 step 链路验证，`balanced` 是 H20 实测的
1024/720/30 实用档，`max` 是非常耗时的 2048/720/100 高分辨率档。深度阶段保留720，
用于规避驱动535/cu121组合在2048深度注意力计算中的CUDA kernel错误。完整实测问题、速度数据、
一键装机参数、立即 tar/scp 流程和故障恢复说明见
[Linux/H20 实测复盘与复跑手册](docs/SEETHROUGH_LINUX_H20_RUNBOOK.zh-CN.md)。

默认`pilot`预设用于确认链路；可以使用`-Preset screen`/`--preset screen`做Seed初筛，或使用
`-Preset quality`/`--preset quality`生成终稿候选。所有分辨率、深度分辨率、Steps、Seed、Alpha、
量化和显存卸载参数均可在测试入口覆盖。每轮还会输出
`reconstruction/quality_report.json`；Linux 多 Seed 会额外输出 `quality-ranking.json`。H20
最高参数低质量样本的证据与优化命令见
[H20 最高参数低质量复盘](docs/SEETHROUGH_H20_LOW_QUALITY_ANALYSIS.zh-CN.md)。

运行前查看本机GPU、显存占用和推荐示例参数：

```powershell
pwsh -NoProfile -File .\scripts\seethrough\Get-HardwareRecommendation.ps1
```

macOS：

```bash
./scripts/seethrough/recommend-hardware.sh
```

## Photopea MCP 分层 PSD 与初始骨架

已有本地 Photopea MCP 时，可使用已审阅的赵云配方，重放“切分 → 边缘归属修正 →
枪杆和关节补绘 → PSD → Spine JSON/PNG → 官方运行库验证”。此路线不使用本地 AI 模型，
原图视角下的初始叠合保持一致，输出 29 个部件、30 根骨骼和双臂 IK。任意新图仍需审阅切分与补绘参数。

完整安装、复跑命令、配方说明和实测问题见
[Photopea MCP 工作流](docs/PHOTOPEA_MCP_WORKFLOW.zh-CN.md)。后续智能体可使用仓库的
[photopea-spine 技能](.agents/skills/photopea-spine/SKILL.md)。成品与实际动作预览见
[赵云验证包](_artifacts/photopea/zhaoyun-20260903.zip)。

## ComfyUI 局部补绘 GPU 测试

针对新提供的 1024 × 1024 站立赵云图，已提交原图、四组补绘输入与蒙版、固定提示词/seed、
ComfyUI API 工作流和运行脚本。先验证披风纹理恢复，再测试披风、大腿与前臂的遮挡补全。
素材准备实际使用 Photopea MCP；H20 推理、像素保护与坐标回贴已验证。产物复核发现目标内部
存在不透明背景色块、披风轮廓越界，完整 PSD 和动作尚未通过。问题证据与后续实验见
[GPU 复核与下一轮方案](docs/COMFY_INPAINT_GPU_REVIEW_NEXT.zh-CN.md)。部署见
[GPU 测试方案](docs/COMFY_INPAINT_GPU_TEST_PLAN.zh-CN.md)，图片见
[新图测试包](examples/comfy-inpaint/zhaoyun-v2/README.zh-CN.md)。

下一轮采用 [Krita AI Diffusion 实施方案](docs/KRITA_AI_GPU_TEST_PLAN.zh-CN.md)：修正输入后，
比较 SDXL + Fooocus 的基础补绘与加入轮廓/材质参考的流程，共 18 张候选。
[交接包](examples/krita-inpaint/zhaoyun-v3-pilot/README.zh-CN.md) 含固定版本、模型哈希、任务矩阵和结果模板；
目前是待执行方案，尚无 Krita GPU 结果，也不由现有 v2 运行器直接执行。

## 授权边界

序列帧转换器实现公开 Spine JSON/atlas 数据结构，不包含或替代 Spine Editor、Spine CLI。Photopea 的离线验证预览包含官方 Spine Runtime 及其许可文本。使用 Spine 商标、编辑器或运行库时，仍需遵守 Esoteric Software 的相关许可条款。输入图片和视频的版权也由使用者自行确认。
