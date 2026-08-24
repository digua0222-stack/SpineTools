# Motion Rig Lab 上手指南

Motion Rig Lab 是一个“视频动作骨点预标注 + 人工纠偏”的最小可用编辑器。它用于把视频中的动作整理为稳定、可复核的二维关节点序列，再交给后续骨骼求解器映射到 T-Pose 部件。它不是 Spine Editor 的替代品，也不会仅凭一段视频自动完成蒙皮、遮挡层级、网格权重和最终动画调优。

本指南使用仓库中的赵云“三连刺”视频和 T-Pose 分离图作为示例。

## 1. 能做什么

当前 MVP 覆盖以下闭环：

1. 载入真实视频与自动生成的 18 点预标注。
2. 按置信度、缺点、骨长突变和持枪约束筛选可疑帧。
3. 在视频画布上逐帧拖动骨点。
4. 将确认过的点标记为锁定，填写审阅备注。
5. 保存点位修改，导出标签 JSON 和 Motion Rig 审阅 JSON。
6. 从细分 T-Pose 图重建透明部件，并预览 23 个刚性附件随骨点运动。
7. 把纠偏后的数据和 `tpose-bind/v1` 绑定交给后续 Spine 导出步骤。

当前 MVP 不承诺：

- 自动预标注等同于最终动画；
- 自动识别披风、发梢、枪穗等柔性物体的完整形变；
- 从单一正面 T-Pose 推断所有侧面和背面素材；
- 生成 Spine Editor 专有的 `.spine` 工程文件；
- 在没有人工抽检的情况下直接用于生产。

## 2. 环境与启动

推荐环境：Windows 10/11、支持 WebCodecs 的 Chromium 浏览器、Bun 1.3.14。仓库固定了 Bun 版本，开发命令以 Bun 为准。

```powershell
Set-Location H:\spine_research\MotionRigLab
bun install --frozen-lockfile
bun run dev
```

Windows 上没有 Bun 时，也已验证可用 npm 启动浏览器版：

```powershell
Set-Location H:\spine_research\MotionRigLab
npm install
npm run dev
```

浏览器打开终端显示的地址，默认是 `http://localhost:5173`。

生产构建与本地预览：

```powershell
bun run build
bun run preview
```

npm 路径对应为 `npm run build` 和 `npm run preview`。

桌面壳不是本次 MVP 的必需条件。`bun run tauri:dev` 还需要 Rust 1.95+ 和 Tauri 系统依赖；只做赵云 Demo 验证时优先使用浏览器版。

## 3. 生成赵云 Demo 数据

Demo 源文件位于 `demo/zhaoyun/assets/`：

- `银枪三连刺.mp4`：768 × 768、24 fps、107 帧；
- `tpos分离部件.png`：1024 × 1024，拆开的基础部件；
- `角色立绘拆分_1.png`：1024 × 1024，角色立绘和部分拆分素材；
- `tpose_detailed_checkerboard_source.png`：1024 × 1024 新细分图，RGB 三通道、没有 alpha，棋盘格已烘焙进像素。

在仓库根目录运行：

```powershell
python -m pip install -r scripts\requirements-motion-rig.txt
python scripts/build_zhaoyun_demo.py
python scripts/extract_tpose_parts.py
python scripts/build_zhaoyun_tpose_binding.py
npx bun scripts/validate_zhaoyun_tpose_binding.ts
python scripts/render_zhaoyun_tpose_preview.py
```

生成器输出：

- `demo/zhaoyun/zhaoyun.motionrig.json`：编辑器交换数据；
- `demo/zhaoyun/zhaoyun.prelabels.contact-sheet.png`：九帧骨架叠加预览；
- `demo/zhaoyun/assets/SHA256SUMS.json`：四个原始输入的哈希清单；
- `public/demo/zhaoyun/` 下的 JSON、`zhaoyun.mp4` 和 `tpose_parts.png`：一键 Demo 使用的 Web 副本。

后四条命令另外生成：

- `demo/zhaoyun/tpose-detailed/`：透明 atlas、资产 manifest、文本 atlas 和 23 张部件 PNG；
- `demo/zhaoyun/zhaoyun.tpose-bind.json`：23 个附件到 18 点动作骨架的绑定；
- `demo/zhaoyun/zhaoyun.tpose-validation.json`：全 107 帧的求解状态与误差；
- `demo/zhaoyun/zhaoyun.tpose-rig.preview.gif` 和 `zhaoyun.tpose-rig.comparison.webm`：附件绑定动图与浏览器可播放的 VP9 左右对比视频；
- `public/demo/zhaoyun/tpose-detailed/`、`zhaoyun.tpose-bind.json`、`zhaoyun.tpose-validation.json` 和两种预览媒体：浏览器预览与验证使用的副本。

这两种预览媒体是通用 JSON/PNG 附件绑定的检查渲染，不是 Spine Runtime 输出，也不是 `.spine` 工程。只运行 `build_zhaoyun_demo.py` 且不想同步其 Web 三件套时可增加 `--skip-web-assets`。生成器为每帧写入 18 个语义点、置信度、来源、锁定状态、帧质量和低置信帧建议。当前基线有 44 个建议帧，点置信度均值为 0.8560、最小值为 0.0200。置信度只用于安排人工审阅优先级，不是人工真值或校准后的正确概率；武器快速移动、遮挡和前后肢交叉处通常需要纠偏。

## 4. 打开项目

### 4.1 打开内置赵云 Demo

1. 启动浏览器版编辑器。
2. 在欢迎页点击 `Open Zhao Yun Motion Rig Demo`。
3. 等待视频、107 帧预标注和 18 点骨架载入；应用会自动打开右侧 `Motion Rig` 面板。
4. 展开 `Reference / T-Pose`，确认 1024 × 1024 参照图可见，并核对 `Coordinate space: image pixels (origin: top-left)`。
5. 展开 `T-Pose Binding`，确认显示 `23 parts`、`23/23 resolved` 和组件化角色预览。
6. 在 `View` 中打开节点名和骨骼边，确认点名、前后肢和枪尖方向与画面一致。

一键入口读取 `public/demo/zhaoyun/`，因此修改生成器或输入后要重新运行 Demo 命令。不要把 T-Pose PNG 当作视频帧导入；它是后续绑定参照，而不是动作源。

### 4.2 导入自己的 Motion Rig 文件

欢迎页的 `Import Motion Rig Files` 是通用入口。在同一个多选文件框中一次选择：

- 一个符合 `motion-rig/v1` 的 `.json`；
- 与 JSON 帧数、尺寸和坐标相匹配的视频，支持 MP4、MOV、WebM 或 MKV；
- 可选的一张 PNG/JPEG T-Pose 或部件参照图。

JSON 和视频缺一不可，图片可不选；不要分三次点击导入。入口按扩展名/MIME 类型识别所选文件，每类使用找到的第一个文件。若同类选了多个文件，先精简选择，避免导入到错误素材。没有选择参照图时，`Reference / T-Pose` 会明确显示未附加图片，骨点审阅仍可继续；通用项目不会回退显示赵云 T-Pose。

导入成功后，应用以 JSON 文件名创建可编辑项目、自动打开 `Motion Rig` 面板，并把所选参照图仅关联到当前视频。外部 AI/跟踪器只要输出相同交换 schema，即可复用这条人工纠偏路径。

注意：通用导入入口目前接收动作 JSON、视频和可选参照图，不接收 `tpose-bind/v1` 文件。内置赵云 Demo 会自动关联绑定 manifest；其他项目需要在集成层为视频设置绑定 manifest URL，或后续补充绑定文件选择器。

## 5. 检查 T-Pose 组件绑定

`T-Pose Binding` 展开区提供两个视图：`Source T-Pose parts` 显示透明 atlas 和当前选中区域，`Bound character preview` 把附件变换到当前视频帧的 768 × 768 坐标空间。

建议按以下顺序检查：

1. 看顶部摘要是否为 `23/23 resolved`，记录 RMSE 和 missing anchors；
2. 在 `Components` 中逐个选择附件，核对名称、`bone`、`slot`、`z` 和 solve 状态；
3. 用组件行的显隐按钮检查遮挡顺序；
4. 用 `Binding` / `Overlays` 开关整体显示，用 `Bones` / `Anchors` / `Errors` 分别检查骨架、目标锚点和重投影误差；
5. 切换到动作极值帧，确认附件随当前骨点更新，而不是只在首帧正确。

首帧基线为 23/23 resolved，其中 12 个 `solved`、11 个单锚点 `degraded`，RMSE 0.7298 px（UI 显示 0.7 px），没有 missing anchors。`degraded` 不等于不可见：肩甲、手、脚、髋甲、膝甲和披风等单锚点附件还能依靠固定缩放与 `driverNodes` 朝向显示，但约束弱于双锚点附件。

以下帧号与 UI 和 JSON 一致，采用从 0 开始的 `frameIndex`。不要只看 Frame 0（首帧）。全序列验证的平均 RMSE 为 9.6672 px，最大为 25.3387 px（Frame 74）；按 8 px 容差，有 90 帧超限，范围为 Frame 17–106。浏览器抽检中 Frame 11 仍较合理（1.5 px），Frame 66（13.0 px）和 Frame 92（21.7 px）已出现明显肢体/比例错位。这说明绑定预览成功暴露了后段骨点漂移，并不代表绑定质量已经通过。直接跳到 Frame 52 时，UI 会从 Frame 0 顺序重算并得到 previous-frame fallback，仍显示 23/23 resolved。

预览中的组件选择、显隐和 overlay 开关是检查工具，不会回写 pivot/anchor，也不是蒙皮编辑器。需要调整绑定时，修改生成脚本或 `tpose-bind/v1` manifest 后重新载入。详细数据约定见 [TPOSE_BINDING.md](TPOSE_BINDING.md)。

## 6. 推荐的人工纠偏顺序

### 6.1 先看异常队列

在 `Motion Rig` 面板中：

- `Confidence threshold` 控制低置信告警阈值；
- `Bone length tolerance` 控制骨长跳变容差；
- `Weapon constraints` 显示持枪约束所需锚点是否齐全；
- `Review queue` 汇总当前阈值下的可疑帧；
- `Next issue` 跳到下一个问题。

置信度只是排序信号，不应解释为“正确概率”。建议先处理缺点和明显骨长突变，再处理低置信点，最后观察动作播放的连续性。

当前赵云 18 点骨架只有 `weapon_tip`，缺少武器尾点和前/后握点，所以 `Weapon constraints` 正确显示 `Needs anchors`。在补齐 `weapon_tail`、`front_grip`、`rear_grip`（或受支持的中英文别名）以前，该项不能证明双手始终贴合枪身。

### 6.2 拖动骨点

1. 在 `Review queue` 点击一条异常，跳到对应帧。
2. 在视频画布中选中角色实例。
3. 拖动错误节点到可见关节中心。
4. 用左右方向键检查前后各 1–3 帧，避免只修一帧而造成新的跳变。
5. 误操作可用 `Ctrl+Z` 撤销、`Ctrl+Shift+Z` 重做。

赵云 Demo 应重点检查：

- 枪高速前刺时的 `weapon_tip`；
- 双手交叉或枪身遮挡手腕时的前/后手腕；
- 俯身时头、颈、躯干的顺序；
- 前后膝盖互相遮挡时的左右身份；
- 动作首尾能否平滑衔接。

### 6.3 锁点与备注

在 `Current frame` 的节点行使用 `Lock` / `Unlock`。锁定表示“这是人工确认过的约束”，供后续重跟踪或求解器保护；它不会让错误点自动变正确，也不会在当前 MVP 中自动启动重跟踪。

在 `Review notes` 写下不能仅靠坐标表达的信息，例如“第 46 帧前手被枪柄遮挡，按前后帧插值”。使用 `Copy review JSON` 复制锁定和审阅状态，并保存为独立的 `.review.json` 文件。

当前构建把锁点和备注自动保存在浏览器 `localStorage`，键名为 `motion-rig-review:v1:<videoId>`；它们不会嵌入 `.slp`。`Copy review JSON` 输出的 schema 是 `motion-rig-review@1`，包含坐标系、骨架、阈值、推断角色、锁点和备注。清除站点数据、切换浏览器/地址或改变 `videoId` 都可能让原会话状态不可见，因此必须把剪贴板内容另存为 `.review.json`。标签点位仍通过应用的项目保存流程持久化。

## 7. 保存与导出

建议每次审阅形成三个文件：

1. 项目文件：`File > Save As`，保留可继续编辑的标签项目；
2. 标签 JSON：`File > Export > JSON...`，保存逐帧骨点；
3. 审阅 JSON：`Motion Rig > Copy review JSON`，把剪贴板内容保存为文件，保留锁点、阈值和备注。

推荐命名：

```text
zhaoyun_three_thrust_v001.slp
zhaoyun_three_thrust_v001.labels.json
zhaoyun_three_thrust_v001.review.json
```

修订版本号而不是覆盖旧版。至少保留一个可回滚版本，并在文件名或备注中记录审阅范围。

## 8. T-Pose 与 Spine 求解边界

视频点位与 T-Pose 的职责不同：

- 视频点位描述“这一帧关节在哪里”；
- T-Pose 部件描述“要被哪根骨骼驱动的图像是什么”；
- 当前 `tpose-bind/v1` 求解器负责把视频骨点转换为每个刚性附件的平移、旋转和统一缩放；
- 绑定阶段还需要原点、父子骨骼、绘制层级、插槽、附件、网格/权重等信息。

现在已经能从新细分图得到 23 个透明部件，并在编辑器中按当前帧骨点预览刚性绑定；这完成了“附件级动作佐证”，但仍不是最终 Spine 动画。manifest 中的 `bone` 是语义驱动字段，`slot`/`z` 是预览绘制顺序，并未建立完整的 Spine 父子骨骼、约束、插槽皮肤或网格权重。当前 `SpineTools` 的序列帧方案仍可作为像素级基线。

如果 T-Pose 缺少侧面、背面或被遮挡部件，先提出明确的图片生成 prompt，再由 MiniMax H3 生成补充素材。不要让图像模型直接猜关节坐标；坐标应由跟踪器、约束和人工审阅共同确定。

## 9. 无 Spine Editor 时的授权边界

Motion Rig Lab 基于 BSD-3-Clause 的 SLEAP App 修改，不包含 Spine Editor，也不应捆绑官方 Spine Runtimes。它可以整理通用的二维骨点和项目数据，但不会伪造 Spine Editor 的专有 `.spine` 工程。

若后续产品集成、修改或分发官方 Spine Runtimes，需要单独核对 Esoteric Software 的许可条件；不要把“工具能输出 JSON”理解为已经获得运行时授权。官方协议会更新，发布产品前应以 [Spine Editor License Agreement](https://esotericsoftware.com/spine-editor-license) 和 [Spine Runtimes](https://esotericsoftware.com/spine-runtimes) 为准，并由负责主体确认适用许可。本节是工程边界说明，不是法律意见。

素材版权也与软件许可分开：视频、T-Pose、生成图和最终动画必须分别确认使用权。本仓库中的赵云素材仅作为本次受控 Demo 输入，不自动授予第三方再分发权。

## 10. 常见问题

### 视频黑屏或无法解码

- 使用最新 Chromium 浏览器；
- 确认视频为 H.264 MP4；
- 避免浏览器禁用 WebCodecs；
- 仍失败时用 FFmpeg 转成恒定帧率 H.264，再重新生成 Demo JSON，避免帧号错位。

### 点位整体偏移

检查 JSON 坐标系是否以视频左上角为原点、单位是否为像素、视频是否被裁剪或缩放。不要对 768 × 768 的坐标直接套到另一分辨率。

### 左右肢突然互换

先找互换前最后一个正确帧，锁定可见关节，再逐帧修正到遮挡结束。对于镜头视角下的“前/后”命名，应以骨架约定为准，不要按屏幕左右临时改名。

### 异常队列太长

先降低敏感度，只处理缺点和大跳变；完成一轮后再提高置信度阈值。阈值是审阅效率工具，不是质量分数。

### 锁点后仍发生变化

当前 MVP 的锁点是审阅约束记录，不等于已经接入自动局部重跟踪。确认已导出 review JSON，并让下游跟踪/求解步骤显式读取 `locked` 状态。

### T-Pose 看起来完整，但动作仍不像视频

优先判断差异来自点位、骨骼长度、绑定原点、层级/遮挡还是柔性部件。点位正确但披风和枪穗不自然时，应增加辅助骨或形变素材，而不是反复移动人体关节点。

### 透明 atlas 边缘仍有棋盘格或白边

新细分源图没有 alpha，棋盘格已经进入 RGB。当前工具只能重建 0/255 二值蒙版，无法恢复原始半透明抗锯齿；边界可能残留棋盘颜色，封闭的透明孔也可能被填实。生产质量需要真正带 alpha 的原图，或向 MiniMax H3 提出“透明背景、不得绘制棋盘格、每个部件不接触”的重新生成 prompt。

### `T-Pose Binding` 显示 degraded

先看该附件有几个可见锚点。当前 manifest 中单锚点附件会使用固定比例和驱动骨方向，状态按设计标为 `degraded`；武器在 `weapon_tip` 不可见时也会只用 `wrist_front` 降级。若状态为 `unresolved`，说明当前帧没有可用锚点且 UI 没有可用回退变换。

## 11. 推荐交付物

一次可复核的动作交付至少包含：

- 原始视频及 SHA-256；
- T-Pose/拆分图及 SHA-256；
- `motion-rig/tpose-components-v1` 资产 manifest、透明 atlas 和 23 张附件；
- `tpose-bind/v1` 绑定 manifest；
- 预标注生成命令和工具版本；
- 可编辑项目、标签 JSON、review JSON；
- 异常队列清零或保留项说明；
- 自动测试和人工验收记录；
- 下游求解器版本与导出参数；
- 许可与素材来源记录。

赵云 Demo 的测试步骤见 [VALIDATION.md](VALIDATION.md)，本次实测结果见 [VALIDATION_REPORT.md](VALIDATION_REPORT.md)。
