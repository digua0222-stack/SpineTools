# _artifacts（临时产物目录）

本目录用于存放分层管线的生成产物和已归档验证样例；源码与可复跑参数位于 scripts、profiles 和 examples。

## 批次记录

| 批次 | 文件 | 内容 | 结果摘要 |
|---|---|---|---|
| batch1 | `zhaoyun-20260902/batch1-zhaoyun-quality-42-88.tar.gz` | Seed 42/88 quality 档（1024 / depth 720 / 40 steps） | seed-88: 74.40（16层）；seed-42: 69.84（20层），均未过 80 |
| batch2 | `zhaoyun-20260902/batch2-zhaoyun-screen-8seeds.tar.gz` | Seed 3,11,19,31,55,71,101,137 screen 档初筛 | **seed-55: 78.63（24层，Alpha 达标）**；seed-101: 76.60；seed-71: 75.78 |
| 输入图 | `zhaoyun-20260902/zhaoyun-body.png` / `zhaoyun-weapon.png` | 人物/长枪分离输入图（枪已移除并修复，8% 透明边距） | 用于人物与武器分开跑分层 |
| batch3 | `zhaoyun-20260902/batch3-zhaoyun-body-screen.tar.gz` | 人物分离图 screen 档（seed 7,23,42,55,88） | seed-55: 76.66（25层）；分离未超全图 78.63，changed-pixel 变差 |
| batch4 | `zhaoyun-20260902/batch4-zhaoyun-weapon-screen.tar.gz` | 长枪分离图 screen 档（seed 42,55,88） | **seed-55: 88.36（26层，全部指标达标，首个 PASS 级）** |

| batch5 | `zhaoyun-20260902/batch5-zhaoyun-parts-screen.tar.gz` | 局部多Pass screen 档（头/躯干/腿/披风 × seed 55,88） | **头部 seed-55: 80.01（23层）**；躯干 seed-88: 77.32；披风 seed-55: 73.78；腿部 seed-55: 65.05 |

| batch6 | `zhaoyun-20260902/batch6-zhaoyun-quality-final.tar.gz` | 武器/头部 seed-55 quality 档验证 | 武器 81.53（9层）/ 头部 70.36，均不如 screen 档，**screen 档为最终推荐** |

| batch7 | `zhaoyun-20260902/batch7-zhaoyun-tune-seed55.tar.gz` | 第一轮单变量实验（seed-55，6 组参数） | **c1（1024/720/24）: 80.83 胜出**；Resolution 是最大正向杠杆；Steps>24 及 LaMa 无益 |

| batch8 | `zhaoyun-20260902/batch8-zhaoyun-seed-round3.tar.gz` | 第二轮 Seed 筛选（1024/720/24 × seed 5,13,29,47,63,79,97,113） | seed-29: 78.26 最高，**均未超过 seed-55 的 80.83**；全图终稿锁定 seed-55 @ 1024/720/24 |

| batch9 | `zhaoyun-20260902/batch9-sam-v0-v1.tar.gz` | SAM 管线 V0 环境探针 + V1 五部件小样（helmet/face/forearm_l/hand_l/spear） | **V1 通过**：部件互不吞并、重放哈希 100% 一致、RGBA 全部来自原图 |

| batch10 | `zhaoyun-20260902/batch10-sam-v2-full-split.tar.gz` | SAM V2 完整站立图拆分（23 部件）+ 回归基线 | **Alpha 召回 100%**，重叠仅关节区 ≤43px，重组均值差 ~1.9/255，重放哈希一致 |

产物包内包含每个 run 的分层结果、重组对比图、quality_report.json、quality-ranking.json 及 install-audit。

## Photopea MCP 样例

| 文件 | 内容 | 验证范围 |
| --- | --- | --- |
| [photopea/zhaoyun-20260903.zip](photopea/zhaoyun-20260903.zip) | 29 部件 PSD、30 骨骼 JSON、独立 PNG、双臂 IK、GIF 与离线预览 | 初始可见像素一致；官方 Spine 4.2 运行库 183 次姿势采样通过；未做桌面编辑器导入验收 |

复跑方式见 [Photopea MCP 工作流](../docs/PHOTOPEA_MCP_WORKFLOW.zh-CN.md)。该归档不包含本地环境、MCP 配置、服务日志或 node_modules；离线预览保留运行库许可文本。

## ComfyUI 补绘 GPU 跑测（zhaoyun-v2，2026-09-03，H20）

| 文件 | 内容 | 结果摘要 |
| --- | --- | --- |
| [comfy-inpaint/zhaoyun-v2-20260903/inpaint-matrix.tar.gz](comfy-inpaint/zhaoyun-v2-20260903/inpaint-matrix.tar.gz) | 4 任务 × seed 17/41/73 完整矩阵（run-report.json、part-native.png、metrics.json、工作流 JSON） | **12/12 技术门通过**；GPU 推理已验证；单次约 2.0s、峰值显存 3.19GB；画质观察与推荐 seed 见验证记录 |
| [comfy-inpaint/zhaoyun-v2-20260903/inpaint-parameter-rounds.tar.gz](comfy-inpaint/zhaoyun-v2-20260903/inpaint-parameter-rounds.tar.gz) | 单变量阶梯：denoise 0.85 / steps 60 | denoise<1 全数长出人物（拒收）；steps 60 seed 17 为最佳披风候选 |
| [comfy-inpaint/zhaoyun-v2-20260903/inpaint-preflight-offline-probe.tar.gz](comfy-inpaint/zhaoyun-v2-20260903/inpaint-preflight-offline-probe.tar.gz) | preflight、dry-run（12 份 API JSON）、cape_control 探针 | 链路检查通过 |
| [comfy-inpaint/zhaoyun-v2-20260903/assembly-check.tar.gz](comfy-inpaint/zhaoyun-v2-20260903/assembly-check.tar.gz) | Photopea MCP 回贴装配验证（assembled.png / parts_only.png） | 放置 0 差异、组装图与原图一致、0 像素侵入原图背景 |

复跑方式见 [ComfyUI 局部补绘 GPU 测试方案](../docs/COMFY_INPAINT_GPU_TEST_PLAN.zh-CN.md)；验证记录见
[verification.json](../examples/comfy-inpaint/zhaoyun-v2/verification.json)。画质门与 Spine 动作门待人工验收。
