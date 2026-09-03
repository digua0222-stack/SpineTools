# 赵云 SAM/rig 基线迁移报告

按 AC-01 要求保留旧基线并记录每次重建的原因与证据；任何版本都不是"覆盖失败"
的产物，旧文件全部保留，激活版本始终为不带后缀的文件。

## SAM 部件哈希（tests/sam/expected-zhaoyun-hashes*.json，46 项）

| 版本 | 文件 | 日期 | 变更原因 | 证据 |
|---|---|---|---|---|
| v1 | expected-zhaoyun-hashes.v1.json | 2026-09-02 | 初始 V2 基线 | 原仓库基线 |
| v2 | expected-zhaoyun-hashes.v2.json | 2026-09-03 | 去噪从导出时前移到分配阶段之前：旧流程把边缘/catch-all/残余分配的合法像素一并丢弃，导出召回仅 98.97%（623px 静默丢失，违反设计 13.1） | 导出召回 100%，42/46 哈希变化 |
| v3（激活） | expected-zhaoyun-hashes.json | 2026-09-03 | 修复连通域遍历对预列出起点重复处理的误标（2×20 块 40→21）；碎片归属被纠正后去噪丢弃量 824→713，40/46 哈希变化；源图改为字节级复制保证哈希链可校验；新增导出后回读统计 | `reports/segmentation-report.json` 的 `exportedReadback`：coverageRecall 1.0、unassigned 0、ambiguousAdoptions 32（预算内） |

623px 差异归因（v1 → v3）：全部为导出期去噪对 <10px 连通块的静默删除；
其中一部分是连通域误标把 ≥10px 合法组件切碎后的程序性误删（v3 修复），
其余为真实 SAM 噪声碎块（已按最近部件重新认领，计入 `denoiseDroppedPixels`
与 `exportedReadback.recoveredPixels`）。不存在归属不明的未分配像素
（unassignedPixels=0）。

## rig 产物哈希（tests/rig/expected-zhaoyun-rig-hashes*.json，9 项）

| 版本 | 文件 | 日期 | 变更原因 |
|---|---|---|---|
| v1 | expected-zhaoyun-rig-hashes.v1.json | 2026-09-03 | 初始 V3 基线（基于 SAM v2 部件） |
| v2（激活） | expected-zhaoyun-rig-hashes.json | 2026-09-03 | 随 SAM v3 部件重建；rig 代码未变，纯 CPU 确定性 |

## 校验器强化（2026-09-03，AC-01）

`spinetools.sam.verify` 现在对以下情况一律 FAIL：多余部件文件、缺失文件、
哈希不匹配、`source/standing.png` 与 `sourceSha256` 不符、run 报告的
`modelSha256`/`promptsSha256` 与期望不符、缺失交叉校验所需文件。
