# Krita AI Diffusion 自动补图调研

调研日期：2026-09-03。检查官方文档和发布版 [v1.53.0](https://github.com/Acly/krita-ai-diffusion/releases/tag/v1.53.0)，源码提交为 `0217cd2197fcadbd70d7e63af25e29cc21cb7c8b`。本次没有安装插件或运行赵云样本；下述画质改善属于待验证假设。

2026-09-04 已形成 [实施方案](KRITA_AI_GPU_TEST_PLAN.zh-CN.md) 和 [18 张试验交接包](../examples/krita-inpaint/zhaoyun-v3-pilot/README.zh-CN.md)，后续执行参数、版本与验收以实施方案为准。

**建议进入小规模对照测试。Krita AI Diffusion 可以自动生成选区内的补绘候选，但还不能据此承诺自动生成可绑定的完整角色部件。** 它使用 ComfyUI 推理，价值在于补绘流程、图层、局部上下文与控制图的组合。只换界面并继续使用原来的模型、灰底和粗轮廓，无法解决已发现的问题。[项目说明](https://github.com/Acly/krita-ai-diffusion)

**与当前失败的关系**

现有 [GPU 复核](COMFY_INPAINT_GPU_REVIEW_NEXT.zh-CN.md) 说明：25/25 个结果通过像素与 Alpha 技术检查，但真实部件存在深色背景块、披风生成人物、目标轮廓外扩，以及整张不透明参考图遮盖候选的问题。因此，当前证据只能说明特定 SD2 基线与输入、验收方案不足，不能概括为 ComfyUI 后端无法完成补绘。

| 当前问题 | Krita 可用机制 | 仍需补充的输入或验证 |
| --- | --- | --- |
| 披风出现人头或人物 | 局部上下文、区域提示词、部件参考图 | 隐藏完整角色参考层，使用布料局部参考；减少人物语义是否有效需实测 |
| 目标内残留深色背景块 | 预填充、结构控制、补绘模型 | 提供完整材质基础和目标轮廓；白色编辑蒙版本身不保证材质覆盖 |
| 接缝、纹理不连续 | Fill、补绘模型、独立羽化与混合蒙版 | 像素画边缘需限制羽化；最终按原生分辨率恢复受保护原画像素 |
| 关节隐藏部分缺失 | 草图/线稿控制、参考图 | 需要先确定肘腕、髋膝的结构及旋转余量；完全不可见结构仍是推测 |
| 装配看似无差异却不可用 | 图层显隐和分层结果 | 隐藏全不透明原图，检查真实部件叠合、材质覆盖和目标动作 |

Fill 偏向延续邻近内容；Expand 适合延展边界；Custom 可以指定上下文与预填充方式。补原有布料时优先试 Fill/Custom；Add Content 的目标是新增内容，允许更大变化。若邻域仍是深色背景，Border/Blur 也可能把错误底色带入补区。[选区补绘说明](https://docs.interstice.cloud/selections/)

ControlNet 的线稿/草图可引导结构，IP-Adapter 可引导材质和风格；结构控制图需要与工作画布对齐。参考图建议只含本部件的可见材质，避免把整个人物作为披风的参考。[控制图说明](https://docs.interstice.cloud/control-layers/)

Regions 只负责把提示词和参考图分配到局部，官方明确说明它不保证对象符合特定形状，甚至不保证对象一定出现。因此“按部件建 Region”不能代替完整部件轮廓。[Regions 说明](https://docs.interstice.cloud/regions/)

**建议测试的模型与环境**

第一轮采用普通、非蒸馏版 SDXL checkpoint，加 Fooocus inpaint patch，再对照加入匹配 SDXL 的线稿控制和局部参考图。Fooocus 补绘节点明确不支持 Turbo、Lightning、Hyper 等蒸馏合并版本；不要把 Illustrious 等衍生体系的扩展与普通 SDXL 随意混用。[补绘节点说明](https://github.com/Acly/comfyui-inpaint-nodes)、[模型体系说明](https://docs.interstice.cloud/base-models/)

这是选择一个值得检验的流程，不是已经证实 SDXL 最适合本角色。v1.53.0 的内置架构列表没有 SD2，不能把当前 `512-inpainting-ema.safetensors` 当作可直接迁移的内置方案。源码确认普通 SDXL 补绘分支使用 Fooocus patch。[架构源码](https://github.com/Acly/krita-ai-diffusion/blob/v1.53.0/ai_diffusion/backend/resources.py)、[工作流源码](https://github.com/Acly/krita-ai-diffusion/blob/v1.53.0/ai_diffusion/backend/workflow.py)

建议本地运行 Krita，连接 H20 集群上的独立 ComfyUI 服务。GPU 推理留在集群；工作站负责画布和操作。插件允许连接远程后端，官方本地推理建议 NVIDIA 6 GB 以上显存，但这不是本方案的显存实测结果。[安装与远程后端说明](https://github.com/Acly/krita-ai-diffusion#optional-custom-comfyui-server)

现有核心节点基线不能直接视为兼容环境。Krita 需要 ControlNet 预处理、IP-Adapter、Acly inpaint 与 tooling 节点及对应模型。按 SDXL 所需子集部署，记录插件、ComfyUI、自定义节点提交和权重哈希。客户端连接检查通过后，才进入画质测试。[后端依赖说明](https://docs.interstice.cloud/comfyui-setup/)

**自动化程度与 MCP 接入**

| 能力 | 调研结论 |
| --- | --- |
| 指定选区后自动补绘 | 支持；可生成多个候选 |
| 智能选择可见对象 | 项目推荐另一个分割插件；分割不等于补出被遮挡的完整部件 |
| 图层、蒙版、参考图进入自定义流程 | 支持 Custom Graphs |
| 自动决定 Spine 部件清单、隐藏轮廓与骨点 | 未发现开箱即用方案，需要外层逻辑 |
| 自动筛选成品、检查跑步/战斗动作 | 未发现配套验收能力，需要继续建设现有检查流程 |
| 官方稳定的 AI Diffusion MCP / 无头批量 CLI | 本次官方文档与发布版源码检索未发现 |

项目把对象分割指向独立的 Krita AI Tools 插件；本次没有验证其分割效果。[项目中的分割工具说明](https://github.com/Acly/krita-ai-diffusion#optional-object-selection-tools-segmentation)

Custom Graphs 可以交换画布、单层、选区和蒙版，并将批次结果作为图层返回。`Krita Canvas` 读取所有可见图层，测试时必须防止全不透明参考图混入输入；优先显式指定部件层。该接口不等于 Spine 骨骼或动作生成接口。[Custom Graphs 文档](https://docs.interstice.cloud/custom-graph/)

查到的第三方 `dcc-mcp-krita` 提供文档、图层、像素矩形、保存和导出等工具，其公开工具清单未包含 AI Diffusion 生成/补绘，也不接受任意 Python 或菜单动作。不能把安装它等同于获得自动补图能力；本次未安装。[该 MCP 的能力清单](https://github.com/dcc-mcp/dcc-mcp-krita#capabilities)

建议的集成路径是：**先在 Krita 验证单部件 → 导出实际生成工作流 → 参数化输入与输出 → 集群批跑 → 原像素/内容/装配验收 → Photopea MCP 组装 PSD → Spine 动作验收。**

官方提供 Interface 设置中的工作流导出。v1.53.0 源码会将图像/蒙版嵌入工作流，输出节点转换为预览；可作为后续批处理适配的基础。适配仍需替换每个任务的图像、蒙版、种子、变换信息，并处理结果文件；不能直接把带 Krita 占位节点的自定义图当成已完成的无头接口。[导出说明](https://docs.interstice.cloud/common-issues/#comfyui-workflow-export)、[导出实现](https://github.com/Acly/krita-ai-diffusion/blob/v1.53.0/ai_diffusion/backend/comfy_workflow.py)

**下一步：先做 18 张候选的有界试验**

建议在执行旧方案的 36 张参数扫描之前，先验证本方案；不继续单纯增加旧模型的 steps。

1. 沿用新站立图 `5b952c09b024…`，新建独立试验目录。先修正棋盘格前景、披风外轮廓和真实遮挡关系；拆开 `sourceKeep`、`repairGuide`、`editMask`、`targetAlpha`。初始轮廓/材质草图允许人工或确定性几何制作，须标记来源，不能把这一步称为已实现全自动。
2. 选择披风小洞对照、完整披风、完整前臂三个案例，各跑 seed 17/41/73。A 为 SDXL + Fooocus 的基础局部补绘；B 在 A 上加入轮廓控制与局部材质参考，共 3 × 3 × 2 = 18 张。两组保持基础模型、裁剪、编辑蒙版、分辨率、采样和预填充一致。这比较约束组合的效果，不能分别归因于某一个控制节点；旧 SD2 结果只作历史参照。
3. 披风小洞使用原有真值做误差/接缝检查，真值区域不得进入输入或参考图。其余案例检查材质是否覆盖目标、是否新增人物/肢体、关节连接面是否完整，以及原生像素保护。人工复核此次试验的结构与风格，记录失败类型，后续再据此开发自动拒收规则。
4. 每个真实补全部件至少 2/3 候选通过内容与轮廓复核，且所有候选满足原像素保护和坐标契约，才扩大到大腿与整套部件。输出单层和三种底板装配图；不以 Alpha 满覆盖代替材质检查，不用全不透明源图盖住候选。
5. 若 B 仍有背景块或人物结构，先修正几何与可见材质证据，或让模型只修确定性纹理延展后的接缝。若主要是风格漂移，再在相同验收条件下比较匹配风格的模型。尚不进入大批量生成或 PSD 成品交付。

通过后再把实际工作流接入批处理，最后验证奔跑跨步、抬臂和持枪等目标动作。新站立图本身没有武器，武器仍需独立素材与独立附件；Krita 补绘不能替代这一输入。

本地使用插件无需购买订阅，仍有 GPU、存储和模型使用条件；可选云服务另计费。本轮优先复用已有 H20 资源。[项目与许可](https://github.com/Acly/krita-ai-diffusion)
