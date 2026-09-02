# SAM 无头管线运行手册（已验证流程沉淀）

对应设计：`docs/SAM_SPINE_ANIMATION_PIPELINE_DESIGN.zh-CN.md`。本手册覆盖已验证的
Phase 1（V0 环境探针 + V1 五部件小样），用于新 Docker 容器快速复跑。

## 环境前提

- Linux + NVIDIA GPU（已在 H20 验证），CUDA 驱动可用（`nvidia-smi`）
- 网络：安装期需访问 GitHub / PyPI / dl.fbaipublicfiles.com；推理期完全离线
- 运行时组件（由脚本自动安装，全部独立隔离，不污染系统）：
  - Python 3.12 venv：`/opt/spinetools/venv`
  - torch 2.5.1+cu121、SAM 2.1（facebookresearch/sam2，Apache 2.0）
  - 权重：`/opt/spinetools/models/sam2.1_hiera_large.pt`
    （sha256 `2647878d5dfa5098f2f8649825738a9345572bae2d4350a2468587ece47dd318`）

## 一键回归（推荐入口）

```bash
git clone <repo> /opt/SpineTools && cd /opt/SpineTools
scripts/sam/run-zhaoyun-regression.sh          # 工作根默认 /opt/spinetools
```

依次执行：环境安装（幂等）→ V0 探针 → V1 五部件分割 → 无头重放 →
哈希比对（`tests/sam/expected-zhaoyun-hashes.json`）。全部一致输出 `[regression] PASS`，
并生成 `regression-<时间戳>.tar.gz` 归档。

## 分步执行

```bash
# 1. 环境
scripts/sam/install-sam.sh /opt/spinetools/venv /opt/spinetools/models

# 2. V0 探针
/opt/spinetools/venv/bin/python -m spinetools.sam.probe \
  --checkpoint /opt/spinetools/models/sam2.1_hiera_large.pt \
  --input examples/seethrough/zhaoyun.png \
  --output output/v0-probe

# 3. V2 全拆分
/opt/spinetools/venv/bin/python -m spinetools.sam.segment \
  --input examples/seethrough/zhaoyun.png \
  --prompts profiles/zhaoyun/prompts.json \
  --output output/zhaoyun-split \
  --checkpoint /opt/spinetools/models/sam2.1_hiera_large.pt \
  --device cuda --offline

# 4. 哈希校验
/opt/spinetools/venv/bin/python -m spinetools.sam.verify \
  --run output/zhaoyun-split \
  --expected tests/sam/expected-zhaoyun-hashes.json
```

## 已验证基线（2026-09-02，H20）

| 阶段 | 结果 |
|---|---|
| V0 探针 | 主体覆盖 81.4%，推理 8.78s |
| V1 五部件 | helmet/face/forearm_l/hand_l/spear 互不吞并，仅关节区 8px 重叠 |
| V2 全拆分 | 23 部件，Alpha 召回 100%，重叠仅关节区 ≤43px |
| 无头重放 | 两次运行部件 PNG 哈希 100% 一致（46 项） |

V2 说明：`shoulder_r` 在原图中被头盔护颈完全遮挡，无可见像素可分割，已在
`profiles/zhaoyun/prompts.json` 的 `occludedParts` 中显式标记（设计文档 3.2 允许）。
`inner_robe` 为 catch-all 区域部件：SAM 无法将其作为连通对象分割，按设计文档 8.3
以显式区域声明承接残余像素，不静默丢弃。

## 提示调优经验（本次实践沉淀）

1. SAM 返回 3 个候选 mask，分数不保证单调排序；先导出全部候选人工挑选，
   再固定 `candidateIndex`（模型/输入变化后必须重选并标记 `stale`）。
2. 像素画短边 <512 时用 2x 最近邻推理副本；mask 映射回原图后从原图裁 RGBA。
3. 相邻同色铠甲（如小臂与拳头）单点/负点难分：先各自取 mask，再用
   `prompts.json` 中的 `subtract`（子部件优先）解决重叠，而不是无限加负点。
4. 导出前做连通域去噪（<10px 碎块清除）；被遮挡的长枪天然是多段，保留大组件。
5. 每轮修改后跑一次重放（同样输入跑两遍比哈希），确认无随机漂移再提交。
