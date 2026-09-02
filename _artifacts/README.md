# _artifacts（临时产物目录）

本目录用于存放 See-through 分层管线的**临时生成产物**，与工程源码无关，可随时删除。

## 批次记录

| 批次 | 文件 | 内容 | 结果摘要 |
|---|---|---|---|
| batch1 | `zhaoyun-20260902/batch1-zhaoyun-quality-42-88.tar.gz` | Seed 42/88 quality 档（1024 / depth 720 / 40 steps） | seed-88: 74.40（16层）；seed-42: 69.84（20层），均未过 80 |

产物包内包含每个 run 的分层结果、重组对比图、quality_report.json、quality-ranking.json 及 install-audit。
