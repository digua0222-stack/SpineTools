# _artifacts（临时产物目录）

本目录用于存放 See-through 分层管线的**临时生成产物**，与工程源码无关，可随时删除。

## 批次记录

| 批次 | 文件 | 内容 | 结果摘要 |
|---|---|---|---|
| batch1 | `zhaoyun-20260902/batch1-zhaoyun-quality-42-88.tar.gz` | Seed 42/88 quality 档（1024 / depth 720 / 40 steps） | seed-88: 74.40（16层）；seed-42: 69.84（20层），均未过 80 |
| batch2 | `zhaoyun-20260902/batch2-zhaoyun-screen-8seeds.tar.gz` | Seed 3,11,19,31,55,71,101,137 screen 档初筛 | **seed-55: 78.63（24层，Alpha 达标）**；seed-101: 76.60；seed-71: 75.78 |
| 输入图 | `zhaoyun-20260902/zhaoyun-body.png` / `zhaoyun-weapon.png` | 人物/长枪分离输入图（枪已移除并修复，8% 透明边距） | 用于人物与武器分开跑分层 |
| batch3 | `zhaoyun-20260902/batch3-zhaoyun-body-screen.tar.gz` | 人物分离图 screen 档（seed 7,23,42,55,88） | seed-55: 76.66（25层）；分离未超全图 78.63，changed-pixel 变差 |
| batch4 | `zhaoyun-20260902/batch4-zhaoyun-weapon-screen.tar.gz` | 长枪分离图 screen 档（seed 42,55,88） | **seed-55: 88.36（26层，全部指标达标，首个 PASS 级）** |

| batch5 | `zhaoyun-20260902/batch5-zhaoyun-parts-screen.tar.gz` | 局部多Pass screen 档（头/躯干/腿/披风 × seed 55,88） | **头部 seed-55: 80.01（23层）**；躯干 seed-88: 77.32；披风 seed-55: 73.78；腿部 seed-55: 65.05 |

产物包内包含每个 run 的分层结果、重组对比图、quality_report.json、quality-ranking.json 及 install-audit。
