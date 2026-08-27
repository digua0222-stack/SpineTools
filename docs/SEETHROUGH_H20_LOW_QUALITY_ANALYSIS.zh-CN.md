# H20 最高参数低质量复盘与优化方案

## 结论

`h20-max-safe-seed42` 已完整执行成功，但不是可继续绑定 Spine 的合格分层。主要原因是
See-through 的固定语义标签与“像素风、全身铠甲、长枪、披风”输入不匹配，不是 H20
算力不足，也不是模型或 CUDA 运行失败。把参数从实用档提高到 `2048 / depth 720 /
100 steps` 没有改善语义完整性，反而把单轮时间提高到约 22 分钟。

因此，优化目标应从“把单轮参数拉满”改为“便宜地生成多个候选、自动拦截低质结果、
只对入选 Seed 运行终稿参数”。

## 本次产物证据

| 项目 | 结果 | 判断 |
|---|---:|---|
| LayerDiff 候选层 | 24 | 推理阶段运行成功 |
| PostProcess 最终层 | 12 | 大量固定语义标签输出为空 |
| Alpha Recall | 96.22% | 低于自动门槛 98% |
| 灰底重组 PSNR | 22.96 dB | 低于自动门槛 24 dB |
| 明显变化像素 | 9.24% | 高于自动门槛 8% |
| 赵云语义组覆盖 | 4/6（66.67%） | 缺少头脸核心与下半身 |
| 自动质量分 | 59.15/100 | 不通过，只可作为失败样本 |

最终只保留了 `back hair`、`topwear`、左右 `handwear`、少量五官、`neck` 和
`objects`。其中 `back hair` 与 `topwear` 的外接矩形分别覆盖约 45.80% 和 43.34%
画布，实际把本应独立的头盔、脸、铠甲、披风和肢体合并成大块。缺失的主要标签包括
`face/head/headwear` 与 `bottomwear/legwear/footwear`。

重组图能保留大致轮廓并不等于可绑定：这次脸和脚明显灰化/缺失，而且大块复合图层无法
分别绑定上臂、前臂、大腿、小腿、头盔和披风。

## 原因排序

1. **固定标签域不匹配。** 当前 v3 标签主要是通用人像和衣着：`topwear`、
   `legwear`、`footwear`、`headwear`、hair、`objects` 等，没有肩甲、上臂、前臂、
   裙甲、膝甲、小腿甲和披风片等 Spine 所需标签。Steps 和显存不会创造新标签。
2. **输入构图对语义模型不友好。** 原图只有 498×345，长枪横跨几乎整个宽度；正方形
   留边放大后，人物主体占比下降，透明区域和武器消耗了大量 2048 画布。
3. **原图是低分辨率像素画。** 2048 输出主要是对 498 像素原图的放大，不会恢复新的
   真实边缘或遮挡纹理。
4. **单 Seed 偶然性。** Seed 42 只是一次概率采样；提高 Steps 不能替代多 Seed 搜索。
5. **后处理不是主要损失点。** 日志显示 LayerDiff 给出 24 个标签候选，PostProcess 只保留
   非空蒙版并拆左右部件；最终 12 层说明大量模型标签本身就是空的，并非脚本随意删除。

## 已排除因素

- H20 正常达到 100% GPU 利用率，显存约 22 GiB/96 GiB，说明不是显存不足。
- ComfyUI、模型、scheduler 和 6 个必需节点均加载成功，`run_report.ok=true`。
- `depth 720` 已避开当前驱动 535/cu121 在 2048 深度注意力上的 CUDA 错误。
- 原图具有真实二值 Alpha，`alpha-mode=preserve` 正确；改为 `opaque` 会把透明背景作为
  不透明矩形输入，通常更差。
- `use-lama=false` 不是这次漏脸/漏腿的主因；v3 使用前发/后发标签，LaMa 只处理特定
  通用 hair 补全路径。

## 脚本优化

本工具链现在在每轮重组后生成：

- `reconstruction/quality_report.json`：像素重组指标、语义组覆盖、疑似超大复合层、
  0–100 分和不通过原因。
- `quality-ranking.json`：一键 Linux runner 对所有 Preset/Seed 的候选排序。

`bootstrap-linux.sh` 新增 `--seeds` 和 `--input`。低质结果默认仍然完整归档，避免临时实例
回收前丢证据；单轮测试可加 `--fail-on-low-quality`，在质量门不通过时返回退出码 3。

同时调整快捷预设：

| 预设 | Resolution | Depth | Steps | 用途 |
|---|---:|---:|---:|---|
| `screen` | 768 | 512 | 12 | 4–8 个 Seed 的低成本语义初筛 |
| `balanced` | 1024 | 720 | 30 | 入选 Seed 制作复核 |
| `quality` | 1024 | 720 | 40 | 入选 Seed 终稿候选 |
| `max` | 2048 | 720 | 100 | 压测/复现，不再作为质量推荐 |

## H20 推荐复跑

先用四个 Seed 筛选：

```bash
cd /opt/SpineTools
git pull --ff-only origin main

./scripts/seethrough/bootstrap-linux.sh \
  --comfy-root /opt/seethrough/ComfyUI \
  --venv-root /opt/seethrough/venv \
  --output-dir /opt/seethrough/output \
  --preset screen \
  --seeds 7,23,42,88 \
  --run-id h20-zhaoyun-screen-4
```

查看自动排序：

```bash
python -m json.tool \
  /opt/seethrough/output/h20-zhaoyun-screen-4/quality-ranking.json
```

只把排名靠前且没有缺失 `head_core/lower_body` 的 1–2 个 Seed 带入终稿。例如入选 7、23：

```bash
./scripts/seethrough/bootstrap-linux.sh \
  --comfy-root /opt/seethrough/ComfyUI \
  --venv-root /opt/seethrough/venv \
  --output-dir /opt/seethrough/output \
  --preset quality \
  --seeds 7,23 \
  --skip-system-packages \
  --skip-plugin-checkout \
  --run-id h20-zhaoyun-quality-2
```

不要直接把四个 Seed 全部跑成 max。相对 `1024/30`，`2048/100` 的理论主计算量约为
13.3 倍，而这次实测没有换来更完整的语义层。

## 输入侧的下一步

如果四个 screen Seed 仍都缺头脸或腿，继续换 Seed 的收益已经很低，应改输入：

1. 从透明原图制作“人物主体（不含长枪）”PNG，紧裁后保留约 5%–10% 透明边。
2. 用 `--input /path/to/zhaoyun-body.png --seeds ...` 单独分人物。
3. 长枪单独保留为一层；本次 `objects` 已是相对可用的隔离结果，也可从原 Alpha 手工提取。
4. 对人物输出继续使用自动质量门。若固定标签仍把铠甲合并为 `topwear`，进入本项目的人工
   蒙版/骨骼编辑器切分肩甲、臂甲、腿甲与披风，不能再靠提高 Steps 解决。

这条“人物与长武器分开”的路线通常比把低分辨率原图直接升到 2048 更有效，也能减少
语义模型把武器、手臂和躯干互相污染。
