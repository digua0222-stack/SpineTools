# SpineTools

离线把 PNG 连续帧或规则精灵表转换为 Spine 序列帧动画，不依赖 Spine Editor、Spine CLI 或在线转换网站。

输出内容：

- `<名称>.png`：透明单页图集
- `<名称>.atlas`：Spine atlas 描述
- `<名称>.json`：Spine JSON 骨架和 attachment 时间轴
- `<名称>.zip`：上述三个运行时文件
- `<名称>.gif`：循环动画预览（不放入运行时 ZIP）
- `<名称>.report.json`：尺寸、哈希和逐帧像素校验报告

## 原理

这个方案生成的是“序列帧 Spine”，不是自动骨骼识别：

1. 将连续图片或精灵表单元按顺序读入。
2. 按最大帧宽高建立单元格，以 10 列、2 像素间距打成透明 atlas。
3. 每帧登记为 `frame_0`、`frame_1` 等 atlas region。
4. JSON 中建立一根 `root` 骨骼和一个 `frame` 插槽。
5. attachment 时间轴按照 `1 / FPS` 切换图片，结尾切回第一帧形成循环。

这种方式可以逐像素贴近视频，但不能独立编辑手臂、武器等身体部件。需要 TPos 时，应把生成的 `frame` 插槽和动画时间轴合并进已有骨架。

默认输出行为与 `spine.dawnwindstudio.top` v2.3 的公开导出格式兼容。本仓库是根据公开行为和输出格式编写的独立实现，不包含该网站代码、Spine 编辑器或专有 Spine Runtime。

## 环境

- Python 3.10+
- Pillow

```powershell
python -m pip install -r requirements.txt
```

## 单动画转换

```powershell
python .\sequence_to_spine.py `
  --input "G:\path\frames" `
  --glob "frame_*.png" `
  --animation "attack" `
  --fps 12 `
  --name "hero_attack" `
  --spine-version 4.2.43 `
  --output "G:\path\export"
```

图片按文件名中的数字自然排序。为了保持视频中的位移，每张图片应使用相同透明画布和相同角色坐标。如果每帧单独裁边，attachment 居中切换时会产生抖动。

GIF 默认同步生成；如只需要 Spine 运行时文件，可添加 `--no-gif`。多动画配置会为每个动画输出一个 `<名称>__<动画名>.gif`。GIF 采用循环播放，帧时长按累计时间取整，保证总时长尽可能贴近 Spine 时间轴。由于 GIF 只支持单色透明和最多 256 色，它仅用于快速查阅，Spine 图集仍保留完整 RGBA 画质。

支持的 Spine JSON 版本：

- `3.8.75`
- `4.2.43`

## 多动画配置

编辑 [example_config.json](example_config.json)，然后运行：

```powershell
python .\sequence_to_spine.py `
  --config .\example_config.json `
  --output "G:\path\export"
```

每个动画可以使用独立的输入目录、文件匹配规则和 FPS，并支持可选事件：

```json
"event": { "name": "hit", "frame": 9 }
```

事件帧从 1 开始计数。

## 精灵表

当输入是单张图片时，工具会尝试识别等分的横向、纵向或网格精灵表。也可以明确指定：

```powershell
python .\sequence_to_spine.py `
  --input .\attack_sheet.png `
  --sheet-cols 8 `
  --sheet-rows 4 `
  --animation attack `
  --fps 12 `
  --output .\export
```

显式网格必须能够整除图片宽高，全透明单元格会被跳过。

## 验证

```powershell
python -m unittest discover -s tests -v
```

转换器会在每次导出后重新打开 atlas，并逐帧比较图集区域与输入图片；结果记录在 `.report.json` 的 `verification` 字段中。

## 授权边界

本工具只实现序列帧打包和公开 Spine JSON/atlas 数据结构，不包含或替代 Spine Editor、Spine CLI、Spine Runtime。使用 Spine 商标、编辑器或运行库时，仍需遵守 Esoteric Software 的相关许可条款。输入图片和视频的版权也由使用者自行确认。
