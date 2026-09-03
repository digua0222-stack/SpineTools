# SAM + Spine 骨骼动画工具链设计

## 1. 文档状态

- 状态：验证前设计基线
- 当前输入：一张带透明通道的完整站立角色图，不要求 TPos
- 验证角色：赵云像素风角色
- 目标输出：可复核的 RGBA 部件、Setup Pose、Spine 4.2 JSON、atlas、预览和视频动作
- 首个运行环境：Linux + NVIDIA H20；后续再扩展 Windows/WSL 与 macOS

本文定义下一阶段的实现边界、文件契约、无头接口和验收流程。开始编码后，如需修改契约，
应同步更新本文和自动化测试。

2026-09-03 增量：SAM V2 已完成可见部件拆分跑测；后续补图阶段调整为零人工，任务与新契约见
[SAM 零人工补全任务](SAM_AUTO_COMPLETION_TASKS.zh-CN.md)。补图范围、候选选择、层级和旋转
验收以该增量规范为准，不再要求人工圈选或审核；本文涉及首次 SAM 提示、视频动作纠偏的
内容仍是各自阶段的原设计，不代表其已实现零人工。新增补全模块当前尚未实现。

## 2. 结论与核心决策

采用以下主链路：

```text
完整站立图
  -> 部件模板与关节建议
  -> SAM 2 点/框提示分割
  -> 蒙版纠偏与关节覆盖扩展
  -> RGBA 部件包 + 原图坐标
  -> 骨骼、Slot、Draw Order、Atlas
  -> Spine 4.2 JSON Setup Pose
  -> 视频姿态/部件跟踪
  -> 骨骼关键帧重定向
  -> HTML/GIF/重组对比与人工验收
```

关键决策：

1. **SAM 2 的入参是完整站立图和提示，不是预先存在的部件图。** 部件图是分割后的产物。
2. **Setup Pose 不强制为 TPos。** 完整站立图可直接作为 Setup Pose；TPos 仅在大幅度动作或
   遮挡补全时更有优势。
3. **同源部件不做 SIFT 回拼。** SAM 从站立图裁切时必须保留原图 bbox，因此部件位置是
   确定值。只有外部部件或另一个视角的素材才进入可选的特征匹配阶段。
4. **See-through 降级为候选蒙版源。** 它不能稳定产生铠甲角色所需的 Spine 部件，不再作为
   主拆图器。
5. **不直接集成 `spine-animation-ai` 源码。** 该项目采用 PolyForm Noncommercial 1.0.0；
   当前项目只参考其“分割、定位、骨架、atlas、预览”的阶段划分，并独立实现代码。
6. **禁止把图层数量或语义标签存在性当成可绑定性。** 验收必须检查实际蒙版、左右部件、
   关节覆盖、重组误差和旋转测试。

## 3. 能力边界

### 3.1 本方案负责

- 通过框、正点、负点或已有蒙版，从完整站立图提取可见部件。
- 保存和重放人工提示，实现首次交互、后续无头批处理。
- 保留每个部件在原图中的坐标、层级、锚点和审核状态。
- 生成骨骼、Slot、Attachment、Draw Order、atlas 和 Spine 4.2 JSON。
- 将视频姿态关键点映射为骨骼平移、旋转、缩放关键帧。
- 使用 SAM 2 Video 跟踪辅助检测部件漂移和遮挡，但不把蒙版直接当骨骼动作。
- 输出可重复验证的报告和预览。

### 3.2 本方案不承诺

- SAM 不生成被遮挡区域，例如枪后的手指、披风后的手臂。
- 单张正面站立图不能恢复真实侧脸或侧身纹理。
- SAM 不自动理解 `left_forearm`、`cape_left` 等业务名称。
- 第一阶段不生成 Spine Editor 的 `.spine` 工程文件，只生成运行时 JSON/atlas/PNG。
- 不捆绑 Spine Editor、Spine CLI 或专有 Spine Runtime。
- 不调用 MiniMax、Gemini 或其他在线图像生成服务；需要补图时必须作为独立、显式阶段。

## 4. 与现有项目的关系

| 现有模块 | 保留方式 | 调整方向 |
|---|---|---|
| `sequence_to_spine.py` | 保留序列帧导出能力 | 抽取通用 atlas/报告代码，供部件骨架导出复用 |
| `scripts/seethrough/` | 保留实验与回归样本 | 输出只能作为 SAM 初始提示候选，不能直接通过质量门 |
| `reconstruct_layers.py` | 复用重组对比思路 | 增加部件遮罩重组、重叠、漏像素与接缝检查 |
| GIF 预览 | 保留 | 增加骨骼旋转和视频动作预览 |
| Spine JSON 导出 | 独立扩展 | 新增多骨骼、多 Slot、骨骼时间轴和 Draw Order |

### 4.1 对 `spine-animation-ai` 阶段的独立替代

| `spine-animation-ai` 概念阶段 | 本项目方案 |
|---|---|
| Gemini 生成分离图 | 使用本地 SAM 2 从原图提取原始像素，不重新生成角色 |
| OpenCV 连通域切片 | 仅用于已经完全分离的图集；粘连部件由 SAM 处理 |
| SIFT + RANSAC 定位 | 同源部件直接使用 bbox；外部素材才启用独立实现的可选定位器 |
| 构建 Spine JSON | 本项目独立实现、独立测试的 Spine 4.2 导出器 |
| Atlas 打包 | 从现有序列帧 atlas 代码抽取共享模块 |
| HTML 预览 | 本项目预览器；运行时依赖由使用者按许可提供 |
| 预设动画 | 可先实现 idle/旋转测试；视频动作由重定向器生成 |

## 5. 总体架构

```text
                         ┌─────────────────────────────┐
                         │ 完整站立图 standing.png     │
                         └──────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │ Source Validator             │
                         │ Alpha/尺寸/主体/哈希/坐标系  │
                         └──────────────┬──────────────┘
                                        │
                ┌───────────────────────▼───────────────────────┐
                │ Prompt Editor / Prompt Loader                 │
                │ bbox + positive/negative points + joint data │
                └───────────────────────┬───────────────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │ SAM 2 Segmentation Worker   │
                         │ 候选 mask、置信度、低清裁块 │
                         └──────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │ Mask QA / Refinement        │
                         │ 去噪、选候选、边界与重叠检查│
                         └──────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │ Joint Coverage Processor    │
                         │ 关节内延伸、保护区、缺失标记│
                         └──────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │ Component Package           │
                         │ parts/*.png + manifest.json │
                         └──────────────┬──────────────┘
                                        │
                 ┌──────────────────────▼──────────────────────┐
                 │ Rig Builder / Atlas Packer / Spine Exporter │
                 └──────────────┬─────────────────────┬────────┘
                                │                     │
                    ┌───────────▼──────────┐   ┌──────▼──────────────┐
                    │ Setup Pose 验证       │   │ Video Retargeter    │
                    │ 重组、旋转、接缝      │   │ Pose + SAM2 Video   │
                    └───────────┬──────────┘   └──────┬──────────────┘
                                │                     │
                                └──────────┬──────────┘
                                           │
                               ┌───────────▼──────────┐
                               │ Preview + QA Report  │
                               └──────────────────────┘
```

## 6. 坐标系约定

为避免裁切后重新定位产生漂移，所有阶段必须使用同一套坐标契约：

- `source`：左上角为 `(0, 0)`，x 向右，y 向下，单位为源图像像素。
- `component`：裁切图左上角为 `(0, 0)`。
- `sourceBBox`：`[left, top, right, bottom]`，右下边界不包含在内。
- `pivotSource`：关节在源图坐标中的位置。
- `pivotLocal`：`pivotSource - sourceBBox.left/top`。
- `spine`：原点默认放在髋部，x 向右，y 向上。
- 源坐标转 Spine：`x_spine = x_source - hip_x`，`y_spine = hip_y - y_source`。
- 所有浮点坐标保留至少 4 位小数，渲染时才取整。

## 7. 输入契约

### 7.1 完整站立图

最低要求：

- PNG RGBA，透明背景优先。
- 主体完整，不裁掉头盔、披风、脚或武器。
- Alpha 不得是整张不透明矩形。
- 首阶段不对原图进行生成式重绘。
- 像素画放大仅用于 SAM 推理；最终颜色必须从原始图采样。

建议预处理：

- 记录原图 SHA-256。
- 若短边小于 512，生成 2x/4x 最近邻或边缘保持推理副本。
- SAM mask 必须映射回原图坐标，再从原图裁 RGBA，禁止把放大图当最终纹理。
- 四周透明边距建议为主体尺寸的 5%–10%。

### 7.2 角色部件模板

第一版赵云模板建议使用以下刚性粒度：

```text
root
└─ hip
   ├─ pelvis
   ├─ torso
   │  ├─ neck
   │  │  └─ head
   │  │     ├─ face
   │  │     ├─ helmet
   │  │     ├─ front_hair
   │  │     └─ back_hair
   │  ├─ shoulder_l -> upper_arm_l -> forearm_l -> hand_l
   │  ├─ shoulder_r -> upper_arm_r -> forearm_r -> hand_r -> spear
   │  └─ cape
   ├─ thigh_l -> knee_l -> shin_l -> foot_l
   └─ thigh_r -> knee_r -> shin_r -> foot_r
```

装饰物只有在需要独立运动时才单列。眼睛、眉毛、睫毛不参与第一阶段刚体拆分；需要眨眼时
再添加 face skin/attachment，而不是用微小图层虚增完整度。

### 7.3 SAM 提示文件

建议文件：`prompts.json`。

```json
{
  "schemaVersion": 1,
  "source": "standing.png",
  "sourceSha256": "<sha256>",
  "model": {
    "family": "sam2.1",
    "checkpoint": "sam2.1_hiera_large.pt"
  },
  "parts": [
    {
      "name": "forearm_l",
      "parentBone": "upper_arm_l",
      "box": [120, 260, 195, 410],
      "positivePoints": [[155, 320], [168, 365]],
      "negativePoints": [[126, 280], [191, 392]],
      "candidateIndex": 0,
      "pivotSource": [148, 275],
      "jointTargetSource": [170, 392],
      "drawGroup": "arm_front",
      "reviewStatus": "approved"
    }
  ]
}
```

约束：

- 部件名必须来自角色模板，不接受 `part_01` 进入最终导出。
- 正点、负点和 bbox 均保存，保证无头复现。
- `candidateIndex` 仅在模型版本和输入哈希一致时有效。
- 模型或输入变化后必须重新计算，并把旧审核状态改为 `stale`。

## 8. SAM 分割策略

### 8.1 两阶段分割

对像素画和紧邻铠甲，采用两阶段而不是整图单点：

1. **粗定位**：以关节模板或人工框得到 ROI。
2. **局部精分**：把 ROI 放大后，在部件内部放正点，在相邻部件放负点。
3. 让 SAM 输出多个候选；按提示一致性、面积范围、边界和人工选择确定候选。
4. 将 mask 映射回原图大小，使用原图 RGBA 导出部件。

### 8.2 提示优先级

```text
bbox + 正点 + 负点
  > bbox + 正点
  > 仅 bbox
  > 仅单点
  > 自动蒙版生成
```

自动蒙版适合提出候选，不适合直接命名和导出。铠甲相邻区域颜色接近，单点容易选择整个人物
或整条肢体，必须允许追加负点。

### 8.3 关节边界

SAM 的视觉边界不等于动画关节边界。每个肢体部件必须额外生成关节保护区：

- 沿骨骼轴向父关节内部延伸部件长度的 10%–20%。
- 允许父子部件在关节区域重叠，不允许在远离关节处大面积重叠。
- 保护区纹理只能来自原图可见区域或明确的补全层。
- 无法补全时写入 `missingTextureRegions`，不得静默视为合格。

## 9. 部件包输出契约

目录结构：

```text
output/<run-id>/
├─ source/
│  ├─ standing.png
│  └─ source-report.json
├─ prompts/
│  └─ prompts.json
├─ masks/
│  ├─ forearm_l.png
│  └─ ...
├─ parts/
│  ├─ forearm_l.png
│  └─ ...
├─ rig/
│  ├─ component-manifest.json
│  ├─ skeleton-layout.json
│  └─ draw-order.json
├─ spine/
│  ├─ zhaoyun.json
│  ├─ zhaoyun.atlas
│  └─ zhaoyun.png
├─ preview/
│  ├─ setup-pose.png
│  ├─ joint-rotation.gif
│  └─ comparison.png
└─ reports/
   ├─ segmentation-report.json
   ├─ rig-report.json
   └─ run-report.json
```

`component-manifest.json` 最低字段：

```json
{
  "schemaVersion": 1,
  "sourceSize": [768, 768],
  "setupOrigin": [360, 610],
  "components": [
    {
      "name": "forearm_l",
      "file": "../parts/forearm_l.png",
      "mask": "../masks/forearm_l.png",
      "sourceBBox": [120, 260, 195, 410],
      "pivotSource": [148, 275],
      "pivotLocal": [28, 15],
      "parentBone": "upper_arm_l",
      "zIndex": 17,
      "reviewStatus": "approved",
      "missingTextureRegions": []
    }
  ]
}
```

## 10. 骨架与 Spine 导出

### 10.1 Setup Pose

- 髋部作为角色局部原点。
- 骨骼从父关节指向子关节，长度为两个关节点距离。
- 部件 Attachment 的位置由 `sourceBBox` 和 `pivotSource` 精确换算。
- 图片、mask、Slot 和 Bone 名称必须一一可追溯。
- Draw Order 先使用模板默认值，再由重组图人工确认。

### 10.2 Atlas

- 保留完整 RGBA，不使用 GIF 调色板作为运行时纹理。
- 默认 2 像素 padding，并支持边缘挤出，降低线性采样漏色。
- 报告每个 region 的原图哈希、atlas 坐标和逐像素校验结果。
- 支持确定性打包：相同输入和配置必须产生相同 atlas。

### 10.3 Spine JSON

第一阶段输出 Spine 4.2 JSON：

- `bones`
- `slots`
- `skins/attachments`
- `drawOrder`
- `animations/setup_validation`
- 后续加入视频动画时间轴

不创建 mesh 权重；MVP 每个刚性部件绑定一根骨骼。披风变形和网格权重属于后续阶段。

## 11. 视频动作接入

SAM 2 Video 用于部件可见性和轮廓跟踪，不能单独给出骨骼角度。动作生成需要两类观测：

1. 姿态关键点：肩、肘、腕、髋、膝、踝、头部方向。
2. SAM 部件蒙版：修正像素风角色上姿态模型容易漂移的肢体位置和遮挡状态。

推荐流程：

```text
视频 -> 抽帧 -> 关键帧选择
     -> 姿态点初值
     -> 首个关键帧 SAM 提示
     -> SAM2 Video 蒙版传播
     -> 关节/蒙版联合拟合
     -> 角度解算与时序平滑
     -> 映射到 Setup Pose 骨长
     -> 关键帧压缩
     -> Spine bone timelines
```

重定向规则：

- 平移主要放在 `root/hip`。
- 四肢默认只写旋转，必要时允许小范围缩放补偿。
- 骨长固定，禁止逐帧改变关节连接关系。
- 遮挡帧降低观测权重，用前后帧插值，不强制相信错误 mask。
- 角度先展开再平滑，避免 `179° -> -179°` 跳变。
- 从 107 帧压缩到约 10 个关键帧时，按骨骼角度误差而非等间隔抽帧。

## 12. 无头模式设计

首次人工纠偏产生 `prompts.json` 后，后续全部阶段必须支持无头执行。

计划中的 CLI：

```bash
# 1. 环境与模型
python -m spinetools.sam.install \
  --model sam2.1_hiera_large \
  --model-dir /opt/spinetools/models

# 2. 站立图拆分
python -m spinetools.sam.segment \
  --input standing.png \
  --prompts prompts.json \
  --output output/zhaoyun/segments \
  --device cuda \
  --offline

# 3. 构建 Setup Pose
python -m spinetools.rig.build \
  --components output/zhaoyun/segments/rig/component-manifest.json \
  --profile profiles/zhaoyun.json \
  --output output/zhaoyun/spine

# 4. 视频重定向
python -m spinetools.motion.retarget \
  --video zhaoyun-action.mp4 \
  --skeleton output/zhaoyun/spine/zhaoyun.json \
  --prompts video-prompts.json \
  --target-keyframes 10 \
  --output output/zhaoyun/spine/zhaoyun-animated.json

# 5. 总体验证
python -m spinetools.validate \
  --run output/zhaoyun \
  --fail-on-error
```

最终提供一键入口：

```bash
python -m spinetools.pipeline \
  --standing standing.png \
  --prompts prompts.json \
  --video zhaoyun-action.mp4 \
  --profile profiles/zhaoyun.json \
  --output output/zhaoyun \
  --offline
```

这些命令是设计契约。实现状态：`spinetools.sam.segment`（V2）、`spinetools.rig.build`
（V3，参数为 `--components/--profile/--output`）已实现并有回归基线；
`install`/`motion.retarget`/`validate`/`pipeline` 尚未实现。

## 13. 质量门与评分修正

现有 See-through 评分把“存在某个语义标签”误当成“部件完整”，Seed 55 的高分已经证明该
规则不能用于 Spine 骨骼验收。新质量门必须以部件模板为中心。

### 13.1 硬性失败条件

任一条件成立即 `REJECT`：

- 必需部件缺失或未审核。
- 左右肢体合并为同一不可拆 mask。
- 非关节区域出现明显跨部件污染。
- 部件 bbox 或 mask 异常覆盖角色大部分区域。
- 重组后出现脸、手、脚、武器或披风的大块缺色。
- 关节旋转测试出现不可接受的透明裂缝。
- 源图、模型或提示哈希变化，但仍复用旧审核状态。

### 13.2 建议指标

| 指标 | MVP 目标 | 说明 |
|---|---:|---|
| 必需部件审核覆盖 | 100% | 不能以相近标签替代 |
| 源 Alpha 重组召回 | >= 99% | 所有可见像素至少被一个有效部件覆盖 |
| 非关节重复覆盖 | <= 3% | 防止巨大兜底层 |
| Changed Pixels | <= 2% | 从原图裁切时应显著优于生成式分层 |
| 重组 PSNR | >= 35 dB | 仅作为像素保真指标 |
| 左右部件独立率 | 100% | 手臂、腿、脚分别存在 |
| 关节旋转测试 | 人工通过 | 每个活动关节至少测试 ±15° |
| 无头重放一致性 | 100% | 相同输入、模型、提示得到相同报告和部件哈希 |

评分只用于排序，硬性条件决定是否能进入骨架构建。

## 14. 赵云验证计划

### V0：环境探针

目标：确认 H20、PyTorch、SAM 2.1 权重和无头推理可用。

产物：

- 环境清单、GPU报告、模型哈希。
- 一张图片、一个 bbox、一个 正点的探针 mask。
- 不启动浏览器。

### V1：五部件小样

先验证最能暴露问题的五个部件：

1. `helmet`
2. `face`
3. `forearm_l`
4. `hand_l`
5. `spear`

验收：部件彼此不吞并，提示可保存和无头重放，RGBA 必须来自原图。

### V2：完整站立图拆分

- 按赵云模板完成全部必需部件。
- 对肩甲、披风、腰甲、膝甲使用局部 ROI 和负点。
- 输出部件联系表和人工审核状态。

### V3：Setup Pose 和旋转验证

- 按原图坐标重组，输出像素差异图。
- 每个四肢关节执行 `-15° / 0° / +15°` 三姿态预览。
- 标记所有缺少隐藏纹理的部位，不自动掩盖问题。

### V4：视频动作最小闭环

- 从赵云视频选 10 个动作关键帧。
- 首轮只绑定 `root/hip/head/upper_arm/forearm/thigh/shin`。
- 输出骨架叠加视频、Spine JSON 和 GIF/HTML 预览。
- 人工对比视频中的关节方向、脚底位置和长枪方向。

### V5：回归与一键运行

- 固定测试图、提示文件、模型版本和预期报告。
- Linux H20 全流程无头运行。
- 失败时保留中间 mask、日志和可恢复的 run manifest。

## 15. 实施阶段

### Phase 1：SAM 无头 MVP

- 新增独立 SAM 虚拟环境和安装脚本。
- 实现单图 bbox/正负点提示和多候选输出。
- 定义 `prompts.json` 与 `component-manifest.json`。
- 完成 V0、V1。

### Phase 2：人工纠偏编辑器

- 图上创建/移动 bbox、正点、负点和 pivot。
- 显示多个候选 mask、透明叠加和边缘放大。
- 保存提示，不把浏览器状态作为唯一数据源。
- 支持重新执行单个部件而非整图重跑。

### Phase 3：骨架与 Atlas

- 独立实现多骨骼 Spine 4.2 JSON 导出。
- 从现有项目抽取确定性 atlas 打包和逐像素验证。
- 实现 Setup Pose 重组、Draw Order 和旋转测试。

### Phase 4：视频动作

- 姿态点提取和人工关节点修正。
- SAM2 Video 部件跟踪。
- 骨骼角度解算、滤波、关键帧压缩和动画写入。

### Phase 5：跨平台与加固

- Linux/H20 作为参考实现。
- Windows 优先支持 WSL2 + NVIDIA；原生 Windows 后续评估。
- macOS 根据 SAM 2 对 MPS/CPU 的实测结果决定支持档位。
- 增加断点续跑、模型清单、哈希、离线模式和归档。

## 16. 风险与停止条件

| 风险 | 缓解方式 | 停止条件 |
|---|---|---|
| SAM 把整条手臂或整个人选中 | 局部 ROI、正负点、候选切换 | 10 次纠偏仍无法得到稳定边界 |
| 像素画特征太少 | 推理副本放大，输出映射回原图 | 放大后仍跨部件污染 |
| 站立姿势遮挡严重 | 关节保护区、TPos/其他素材补充 | 缺失纹理超过可接受动作范围 |
| 单正面图无法表现侧身 | 多视角 skin 或限制动作角度 | 目标动画要求明显转身 |
| SAM2 Video 漂移 | 关键帧重新提示、遮挡降权 | 连续多帧部件身份交换 |
| 评分再次出现高分误判 | 硬性部件门、人工审核、旋转测试 | 必需部件不完整时禁止导出 |
| 第三方许可证不兼容 | 不复制非商业代码，依赖隔离 | 无法取得商业许可且无法独立实现 |

## 17. 许可证和依赖边界

- SAM 2 官方代码、模型及演示材料使用 Apache 2.0，实际分发时仍需保留相应许可证和声明：
  <https://github.com/facebookresearch/sam2>
- `spine-animation-ai` 当前采用 PolyForm Noncommercial 1.0.0，商业用途需要单独授权：
  <https://github.com/GenielabsOpenSource/spine-animation-ai/blob/main/LICENSE>
- 本项目不得复制、改写或派生 `spine-animation-ai` 的源码；允许依据通用算法思想独立实现，
  并保留独立的代码结构、测试和提交历史。
- Spine Editor、CLI 和 Runtime 的授权独立于本工具。本仓库不捆绑这些专有软件。

## 18. 验证通过定义

只有同时满足以下条件，方案验证才算通过：

1. 完整站立图能通过保存的提示文件无头重放并生成命名部件。
2. 必需部件 100% 存在且经过人工审核，不以语义标签猜测代替。
3. Setup Pose 重组达到质量门，并通过所有活动关节 ±15° 测试。
4. 输出 Spine 4.2 JSON、atlas、PNG 能在独立预览器中加载。
5. 至少一个赵云视频动作被压缩为约 10 个关键帧并可播放。
6. 所有输入、模型、参数、人工提示和产物哈希可追溯。
7. 全流程不要求 MiniMax/Gemini，不要求在服务器上打开浏览器。

在 V1 五部件小样通过前，不进入完整角色、视频重定向或大规模模型调参。
