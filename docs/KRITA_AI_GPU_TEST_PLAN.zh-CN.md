# 赵云 Krita AI Diffusion 补绘实施方案

制定日期：2026-09-04。状态：**方案已制定，GPU 试验待执行**。依据 [Krita 调研](KRITA_AI_DIFFUSION_RESEARCH.zh-CN.md) 和 [v2 产物复核](COMFY_INPAINT_GPU_REVIEW_NEXT.zh-CN.md)。本方案优先于旧复核文档中的 36 张 SD2 参数扫描；像素保护、正确轮廓、无遮盖装配和动作验收要求继续适用。

交接配置在 [试验目录](../examples/krita-inpaint/zhaoyun-v3-pilot/README.zh-CN.md)：包含版本与权重清单、18 个任务、提示词和结果模板。它们是实施规格，**不是已经接入运行器的 ComfyUI API 图**。本次没有生成新版蒙版、KRA、PSD 或 GPU 结果；这些是下表明确列出的交付项。

**目标与执行顺序**

验证局部补绘能否补满披风和前臂，保持原画风格，并为之后批处理提供可复用流程。先比较同一个 SDXL 模型下的约束组合；不据此宣称 Krita 普遍优于 ComfyUI，也不把单部件通过当作整套 Spine 绑定成功。

| 阶段 | 执行位置 | 工作与交付 | 进入下一步的条件 |
| --- | --- | --- | --- |
| K0 输入准备 | 本地 CPU / 图层工具 | 新版输入、蒙版、轮廓、局部参考、来源与坐标清单 | 原图哈希正确；棋盘格、轮廓和真值泄漏检查通过 |
| K1 环境与流程 | Krita 工作站 + H20 服务 | 锁定环境；KRA；A/B 实际工作流；两个对照探针 | 两组节点、模型、蒙版方向与输出链路正确 |
| K2 画质试验 | H20 | 三案例 × 两组 × 三种子，18 张候选及逐张报告 | 按完整结果统计，未追加挑选种子 |
| K3 批处理接入 | CPU 调度 + H20 | 图像/蒙版参数化、结果回收、原生合成与拒收；最多两次重放 | 保存实际流程与输入映射，证明可独立执行 |
| K4 扩为角色 | Photopea + Spine | 大腿等完整部件、武器、PSD、目标动作检查 | 内容、装配和动作分别通过后才标成品 |

K0 和 K2 允许开发人员制作一次性结构标注、复核全部样本，用于建立输入与验收规则；这不是已经完成的无人值守生产流程。K3 的自动语义验收无法确定时须返回待复核/拒收，不能把未知状态写成通过。

**环境与模型固定方式**

采用本地 Krita 连接集群独立 ComfyUI 服务。建议 GPU 端使用现有 H20 环境中的独立虚拟环境或容器，工作站不承担扩散推理。安装和连接按 [官方后端文档](https://docs.interstice.cloud/comfyui-setup/) 执行。服务地址使用实际可达的内网或隧道地址，写入运行记录。

| 组件 | 本轮固定值 |
| --- | --- |
| Krita AI Diffusion | v1.53.0，提交 `0217cd2197fcadbd70d7e63af25e29cc21cb7c8b` |
| ComfyUI | 插件资源定义指定的 `4da9e2dbead52fc1e68beae33fe3d7ad63b63241` |
| 自定义节点 | ControlNet Aux、IP-Adapter Plus、Acly Tooling、Acly Inpaint；完整提交见 environment.lock.json |
| 基础模型 | Stability AI `sd_xl_base_1.0.safetensors`，普通 SDXL 1.0，使用内置 VAE；不加 Refiner |
| 补绘 | `fooocus_inpaint_head.pth` + `inpaint_v26.fooocus.patch` |
| B 组结构控制 | Xinsir ControlNet Union SDXL 1.0 ProMax，Krita Line Art 模式 |
| B 组材质参考 | `ip-adapter_sdxl_vit-h.safetensors` + 匹配的 CLIP Vision ViT-H，Reference 模式 |

基础模型选官方普通 SDXL 作为可复现起点，尚未证明它是最佳像素风模型。[基础模型说明](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0)、[权重 SHA256](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/sd_xl_base_1.0.safetensors)

节点提交与辅助权重校验值取自 v1.53.0 的 [resources.py](https://github.com/Acly/krita-ai-diffusion/blob/v1.53.0/ai_diffusion/backend/resources.py) 和 [models.json](https://github.com/Acly/krita-ai-diffusion/blob/v1.53.0/ai_diffusion/presets/models.json)，本次只校验清单来源，未下载验证大模型。下载地址可能含 main，下载后的 SHA256 必须与清单一致；不匹配就停止，不静默更新。

清单含插件 SDXL 工作负载所需的辅助资源。其中 Hyper LoRA、MAT、放大模型可以作为安装依赖存在，但本轮实际生成图中禁止启用加速 LoRA、Refiner、二次扩散放大或额外风格 LoRA。Fooocus 不使用 Turbo/Lightning/Hyper 蒸馏合并模型。[Fooocus 兼容要求](https://github.com/Acly/comfyui-inpaint-nodes)

Krita 使用官方发布 ZIP 安装，不能用缺少打包依赖的源码 ZIP 代替。Krita 桌面版至少符合插件要求的 5.2.0；实际版本、OS、Python/Torch/CUDA、GPU、显存、节点提交和模型哈希在 K1 写入运行记录。推荐版本组合来自插件上游，仍需实际探针验证。不得复用旧环境的“全部禁用自定义节点”启动方式。

**K0：输入与坐标契约**

源文件复用 [新站立图](../examples/comfy-inpaint/zhaoyun-v2/source.png)，SHA256 `5b952c09b0240b017c7d0107da02e7f7e5247c10f5d0c60f01ec83e2b7d7b988`，1024 × 1024。该文件的棋盘格是真实 RGB，不能据其 Alpha 判断前景。旧 manifest、粗抠图、补全蒙版只作参考；不得直接当作已经修正的 v3 输入。

三案例为 `cape_control`、`cape_complete`、`forearm_L_complete`，L 表示画面左侧。完整披风和前臂的隐藏区域需制作合理结构及连接余量；制作记录说明哪些轮廓来自原图、哪些是推测。第一轮不复用其他源图的骨点或 SAM 结果。

| 每案例文件（K0 待制作） | 约定 |
| --- | --- |
| source-crop-native.png | 原图精确裁片；只供最终恢复和评测，不将未遮挡真值送入生成 |
| source-keep-native.png | L8，255 表示确认来自原图且禁止改动的部件像素 |
| target-alpha-native.png | L8，255 表示部件目标覆盖；0 为透明背景 |
| edit-mask-native.png | L8，255 表示待补绘；与 keep 不相交，两者并集等于 target |
| repair-guide-native.png | 与裁片等大的推测结构/材质基础；来源独立记录，不能计入 keep |
| input-model.png / edit-mask-model.png | 1024 × 1024 RGB 输入与 L8 编辑蒙版，显式按 RED/亮度值读取 |
| lineart-model.png | 1024 × 1024 黑线白底，B 组使用；基于完整目标结构且无棋盘格/遮挡人物 |
| material-reference.png | 本部件可见材质的局部参考；B 组使用，避开人脸和整个人物 |
| placement.json / provenance.json | 源图 bbox、方形补边、缩放、像素中心约定、pivot 与每项输入 SHA256 |

目标 bbox 每边加 16 个原图像素上下文，再等比补为方形；目标最长边尽量占 70–85%，不足时显式记录原因。裁片取值与补边顺序必须记录，禁止分别拉伸 X/Y。两组使用同一套输入、裁剪、预填充和提示词。蒙版放大/缩小采用最近邻；RGB 最终缩回采用同一固定方法（本轮 Lanczos），然后逐像素恢复 native keep，不把模型放大当成真实细节增加。

`cape_control` 仅作已知纹理对照，不是透明 Spine 部件。保留其原始测试裁片和固定小洞以支持同区域误差对比；允许保留裁片上下文，但绝不能泄漏洞内真值。洞内 RGB 在缩放、预填充、参考图、线稿提取之前先遮掉，避免重采样混入答案。完整真值仅保存在 evaluation-only 区域，禁止作为可见 KRA 图层、ControlNet/IP-Adapter 输入或生成缓存。该案例可以维持裁片的全不透明 target，必须在报告中标记 `evaluation_only`。

白色编辑蒙版规定允许改动，不定义模型应该画什么；target Alpha 也不能证明材质已覆盖。先制作可用形状与局部材质，再做生成。[选区处理说明](https://docs.interstice.cloud/selections/)

**K1/K2：A/B 设置与 18 张矩阵**

| 项目 | A：基础局部补绘 | B：结构与材质约束 |
| --- | --- | --- |
| 模型、Fooocus、输入、提示词 | 相同 | 相同 |
| 模式 | Custom，Seamless 开启，Fill=None | 相同 |
| 预填充 | K0 冻结的 repair guide；不再自动 Blur/Border | 相同 |
| 上下文 | 准备好的 1024 方形工作画布 | 相同 |
| Line Art / Reference | 均关闭 | Line Art 0.80；Reference 0.60 |
| 控制生效范围 | 无 | 采样进度 0.0–1.0；由实际导出图确认 |
| 采样 | 30 steps，CFG 6，Euler / normal，strength=1.0，batch=1 | 相同 |
| 自动处理 | 关闭提示词翻译、风格附加词、自动选 seed、自动补充参考条件、二次生成与放大 | 相同 |
| 选区羽化 / 混合 | 0 / 0；使用冻结蒙版，原生合成后检查接缝 | 相同 |

这些参数是第一轮实验起点，不是已验证最佳参数。插件 UI 数值未必一一等于后端权重：K1 保存实际图中的 ControlNet/IP-Adapter 权重、时间范围、Union 控制类型、分辨率、提示词及节点输入，并冻结映射。若 UI 无法表达约定，使用已核对的 Custom Graph；任何变更形成新的试验版本，不能混进当前 18 张。

使用 Line Art 时确认插件正确给 Union 模型设置控制类型，禁止简单把裸线稿接上后默认类型不明。提交给 Krita 的线稿为黑线白底；v1.53.0 工作流会反相后交给 ControlNet，批处理重放保留这个步骤，不要重复反相。结构图负责补完整轮廓；Reference 负责材质。Regions 不保证形状，本轮仅一个部件/一个提示域，避免额外区域和根提示词的影响。[控制图说明](https://docs.interstice.cloud/control-layers/)、[工作流源码](https://github.com/Acly/krita-ai-diffusion/blob/v1.53.0/ai_diffusion/backend/workflow.py)、[Regions 限制](https://docs.interstice.cloud/regions/)

| 案例 | A 种子 | B 种子 | 数量 |
| --- | --- | --- | --- |
| cape_control | 17、41、73 | 17、41、73 | 6 |
| cape_complete | 17、41、73 | 17、41、73 | 6 |
| forearm_L_complete | 17、41、73 | 17、41、73 | 6 |

提示词已经写入 [experiment.json](../examples/krita-inpaint/zhaoyun-v3-pilot/experiment.json)。披风仅描述银白布料、灰紫褶皱、连接和轮廓；前臂仅描述银色护臂、完整肘腕端、材质和高光。两组使用完全相同的正/负提示词，不追加人物职业。空白区域在 strength=1 时不会可靠保留 guide 的全部信息，B 组的独立控制输入是待检验的主要约束。

先跑 A/B 的 `cape_control/17` 两个探针。若版本与输入不变，它们计入 18 张；变更则整体升版并保留旧探针记录。K3 最多增加两个相同任务的重放，最多 20 次有图生成；所有失败任务也要记录，基础设施无图失败最多重试两次，不换 seed 追选结果。超时先查 prompt ID 状态，避免重复提交仍在运行的任务。

**K3：自动化接入要求**

在 Krita 保存 KRA 和设置，然后启用 Interface 中的工作流导出，逐个保存最后一次生成的 `workflow.json`，避免下一次覆盖。v1.53.0 可将图像/蒙版嵌入导出图；后续适配需把输入与结果回收参数化。[官方导出说明](https://docs.interstice.cloud/common-issues/#comfyui-workflow-export)、[导出源码](https://github.com/Acly/krita-ai-diffusion/blob/v1.53.0/ai_diffusion/backend/comfy_workflow.py)

实施时交付以下内容：

1. A/B 实际 API 图和可读节点输入映射。分别映射 input、edit、lineart、material reference、seed；保留 source keep/target Alpha 供原生后处理，不混淆生成蒙版与输出 Alpha。
2. 提交前检查节点和模型，以及每个输入哈希/尺寸；执行后保存 prompt ID、原始结果、实际参数、耗时和显存统计方式。导出 Preview 输出也需要可靠下载和改为唯一文件名。
3. 原生尺寸恢复与坐标回贴；按 target 写 Alpha，按 keep 恢复原图 RGBA；裁片中心不能替代原画位置。技术门失败即拒收。
4. 用两个固定任务分别重放 A/B，比较输入/图的哈希及输出；同 GPU、依赖和参数下仍不一致，记录差异与非确定性来源，不能无记录认定等价。

现有 `scripts/comfy_inpaint/run.py` 固定生成 v2 SD2 图，**不能只换 checkpoint 或把本目录 JSON 当作其输入**。GPU 执行者可先在 Krita 完成矩阵；无人值守调度是 K3 待实现的适配。通用 Krita MCP 没有被本方案当成已验证的 AI Diffusion 接口。

**验收与决策**

逐张填 [report.template.json](../examples/krita-inpaint/zhaoyun-v3-pilot/report.template.json)，各阶段未做保持 null/not_run，不合并成一个“成功”。

| 检查 | 必须满足 / 输出 |
| --- | --- |
| integrity | keep 区 native RGBA 零差异；Alpha 精确匹配；尺寸和回贴位置正确 |
| appearance | 无额外人物/肢体；目标内材质连续；无背景占位块；关节连接面完整；原生 100% 视图风格与接缝可接受 |
| control | 固定小洞内 MAE、接缝对比和三种子的逐张图；与同范围 v2 指标比较并注明流程已变化 |
| assembly | 完整参考图隐藏；替换部件的旧可见层移除；黑/白/洋红三底色检查；未制作真实前景部件时为 not_run |
| motion | 后续实际目标动作检查；本轮不把 ±15° 试转或图层导入当作跑步/战斗通过 |

近底色比例只作诊断，不按颜色机械抠透明，真实深色阴影不能被误拒。初轮 appearance 使用逐张人工复核及明确拒绝原因，阈值和判定标准在看候选前记录。已有“人头披风”“整块底色”“全不透明原图覆盖结果”等坏例必须能判失败。

披风和前臂应分别达到同一组内至少 2/3 候选通过内容检查，同时技术门全部通过。若只有 B 达标，优先进入 B 的批处理；A/B 都达标且 B 无稳定收益，优先较简单的 A；只有 A 达标则记录控制组合退化并使用 A。均不达标时结束本轮，保留全部失败证据，先改输入几何/材质，再决定是否另测风格模型。两组区别是组合约束，不能把收益单独归因于 ControlNet 或 IP-Adapter。

K2 达标只标记 `part_pilot_passed`。大腿、全角色 PSD、武器和 Spine 动作均有独立状态，不自动升级为完成。

**结果回传与后续工作**

建议归档到 `_artifacts/krita-inpaint/zhaoyun-v3-pilot/<run-id>/`，包含：环境实际记录、K0 输入和 SHA256、KRA、全部工作流与候选、raw/composited/native PNG、报告、拒绝原因和三底色预览。大模型、虚拟环境和凭据不入库；KRA 可能含评测参考，必须记录 evaluation-only 层是否隐藏并确认它们未进入生成输入。

回传结论至少回答：A/B 各案例通过几张；人物/背景块是否改善；原像素是否保持；自动化重放是否完成；装配/动作哪些还没做。报告引用实际文件路径与哈希；不要只提交精选效果图。

通过后扩展大腿等部件，沿用 Photopea 的坐标与 PSD 链路，再覆盖奔跑最大跨步、抬臂和挥枪中间姿态。新站立图没有武器，武器使用独立持枪参考，分别准备枪头、枪杆、缨尾与握持约束。缺少某个动作参考时明确该动作未验证。
