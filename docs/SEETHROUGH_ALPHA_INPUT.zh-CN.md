# See-through Alpha 入参修复与验证

## 问题与修复

ComfyUI 的 `LoadImage` 把透明PNG拆成两个输出：RGB `IMAGE` 与反相Alpha `MASK`；透明处的
MASK值为1，不透明处为0。旧工作流只连接IMAGE，See-through收到3通道图后补入全255 Alpha，
导致原图透明区域下的黑色RGB变成不透明黑背景。

修复使用ComfyUI自带的 `JoinImageWithAlpha`，不修改第三方插件：

```text
LoadImage.IMAGE ──> JoinImageWithAlpha.image
LoadImage.MASK  ──> JoinImageWithAlpha.alpha
                     │
                     └── RGBA IMAGE ──> SeeThrough_GenerateLayers.image
```

`JoinImageWithAlpha` 内部执行 `alpha = 1 - mask`，正好恢复PNG原始Alpha。

## 固定对照参数

| 参数 | Alpha修复对照值 | 说明 |
|---|---:|---|
| `AlphaMode` | `preserve` | 使用Join节点恢复RGBA；`opaque`仅用于复现旧基线 |
| `Resolution` | `512` | 当前低显存对照分辨率 |
| `DepthResolution` | `384` | Marigold深度分辨率 |
| `Steps` | `30` | 插件推荐的制作步数 |
| `Seed` | `42` | 固定随机种子，保证可比性 |
| `cache_tag_embeds` | `true` | 缓存tag embedding并卸载文本编码器 |
| `group_offload` | `true` | 分块搬运模型，降低显存峰值 |
| `auto_download` | `false` | 强制使用本地固定revision模型 |
| `tblr_split` | `true` | 拆分左右对称部件 |
| `use_lama` | `false` | 避免额外模型下载，保证离线对照 |

赵云第53帧原图为498×345 RGBA，约64.69%像素完全透明。修复后的工作流应保留这一透明轮廓，
而不是把透明区转换成黑色背景。

## 执行命令

```powershell
pwsh -File .\scripts\seethrough\Test-Installation.ps1 `
  -ComfyRoot H:\ComfyUI `
  -FullInference `
  -InputImage "G:\Users\zijuezhang\AppData\Local\com.minimax.hub\MiniMax Design\current Data\Projects\赵云形象\spine_generated\images\video_frame_053.png" `
  -Resolution 512 `
  -DepthResolution 384 `
  -Steps 30 `
  -Seed 42 `
  -AlphaMode preserve
```

旧基线只需改为 `-AlphaMode opaque`。两种模式的输出文件名前缀分别包含
`seethrough_smoke_preserve_` 和 `seethrough_smoke_opaque_`，便于人工逐部件对照。

## 验收要点

1. `seethrough-smoke.json` 中 `alphaMode` 必须为 `preserve`。
2. 输出JSON的 `layerCount` 大于0，且各PNG拥有有效Alpha通道。
3. 重点检查披风/后发、头盔/脸、长枪/手部是否减少串层。
4. 30步仍会生成隐藏区域，不能要求与输入可见像素完全一致；可见区最终应回贴原图像素。
5. 512用于验证Alpha影响；通过后再升到1024/30评估制作质量。

## 赵云第53帧实测结论

在 `512 / depth 384 / 30 steps / seed 42` 下完成了严格对照：

| 模式 | 最终层数 | 输出前缀 |
|---|---:|---|
| 旧RGB/opaque基线 | 19 | `seethrough_smoke_4a908bcb_20260824_202633_c7b2d173_` |
| RGBA/preserve修复 | 19 | `seethrough_smoke_preserve_df382714_20260824_204046_86d64230_` |

19个同名部件中有12个逐像素完全一致；其余部件的Alpha IoU为0.9884–0.9983，最大RGBA
平均绝对差为1.074/255（back hair）。因此，`preserve`确实恢复了Alpha约束，但对本例的语义
分层影响很小。

代码层原因是LayerDiff把输入RGB用于扩散条件，原图Alpha主要作为TransparentVAE解码阶段的
输出mask；它不会改变透明像素下已经存在的黑色RGB。应继续把 `preserve` 作为正确默认值，
但不要期待它解决披风/后发、头盔/脸等串层。2步到30步带来的提升远大于Alpha模式差异；
剩余问题主要来自512分辨率、像素风域差异、侧身遮挡和模型固定语义类别。

本次修复版元数据：
`H:\\ComfyUI\\output\\seethrough_smoke_preserve_df382714_20260824_204046_86d64230_layers.json`。
