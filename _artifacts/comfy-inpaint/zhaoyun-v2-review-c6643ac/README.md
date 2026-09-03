# GPU 产物本地复核证据

输入为提交 `c6643ac` 中 `_artifacts/comfy-inpaint/zhaoyun-v2-20260903/` 的四份归档。复核时间 2026-09-03；无新模型推理。图片仅为已有结果的排版、放大和诊断标记，未修绘候选内容。

完整判断与后续任务见 [复核方案](../../../docs/COMFY_INPAINT_GPU_REVIEW_NEXT.zh-CN.md)。

- `independent-metrics.json`：对实际 PNG 本地重算原运行器的像素/Alpha 指标，25/25 技术门通过。
- `background-diagnostics.json`：编辑区与底色 `#303947` 逐通道最大差 ≤12 的原生像素统计。该特征不能独立区分合法阴影与背景污染。
- `assembly-audit.json`：坐标重组 RGBA 一致；源图全不透明，使任意错误底层也能零差异；候选超出近似前景的数量和位置。
- `cape-candidates.jpg`：三轮披风 × 三个 seed 的独立部件视图。
- `limb-candidates.jpg`：大腿/前臂，28/60 steps × 三个 seed；近邻放大仅用于检查原生像素。
- `control-comparison.jpg`：已知披风纹理局部原图与三个修复结果。
- `assembly-outside-foreground.png`：红色标示候选超出已有粗抠前景的位置；粗抠图不作为精确真值。

部件显示在深色底板上不意味着其暗色区域透明。透明性判断来自 PNG 的实际 Alpha，推荐候选中的近底色编辑像素全部为 Alpha 255。

本复核保留上次 GPU 观察作为历史记录；不接受“整图盖住后的零差异证明补全合格”，也不接受“Alpha 满覆盖等于材质完整”。
