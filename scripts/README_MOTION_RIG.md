# 赵云 Demo 预标注管线

`build_zhaoyun_demo.py` 是一个可重复、纯本地的基线预标注器。它用赵云 Demo 首帧的 18 点引导配置启动，再用 OpenCV 前向/反向金字塔 Lucas–Kanade 光流传播到全视频。输出的置信度用于编辑器排序人工复核，不是真值或经过校准的概率。

## 运行

```powershell
cd H:\spine_research\MotionRigLab
python -m pip install -r scripts\requirements-motion-rig.txt
python scripts\build_zhaoyun_demo.py
```

默认读取：

- `demo/zhaoyun/assets/银枪三连刺.mp4`
- `demo/zhaoyun/assets/tpos分离部件.png`
- `demo/zhaoyun/assets/角色立绘拆分_1.png`

默认输出：

- `demo/zhaoyun/zhaoyun.motionrig.json`：编辑器交换文件；
- `demo/zhaoyun/zhaoyun.prelabels.contact-sheet.png`：9 帧叠加骨架预览；
- `demo/zhaoyun/assets/SHA256SUMS.json`：三个原始输入的体积和 SHA-256。
- `public/demo/zhaoyun/zhaoyun.motionrig.json`、`zhaoyun.mp4`、`tpose_parts.png`：Web 编辑器的无中文 URL 三文件载荷。

不需要预览图时：

```powershell
python scripts\build_zhaoyun_demo.py --skip-preview
```

如果只想更新研究数据、不覆盖 Web Demo 载荷：

```powershell
python scripts\build_zhaoyun_demo.py --skip-web-assets
```

## 数据约定

- schema：`motion-rig/v1`；
- 坐标：原视频像素，原点在左上，x 向右、y 向下；
- 每点：`x` / `y` / `confidence` / `visible` / `source` / `locked`；
- 置信度范围：0–1；默认低置信阈值为 0.55；
- `suggestions` 根据最低/平均置信度、低置信点数和帧间大位移生成。

18 个点为：`root`, `pelvis`, `torso`, `neck`, `head`, `shoulder_back`, `elbow_back`, `wrist_back`, `shoulder_front`, `elbow_front`, `wrist_front`, `hip_back`, `knee_back`, `ankle_back`, `hip_front`, `knee_front`, `ankle_front`, `weapon_tip`。

## 测试

```powershell
python -m unittest scripts.tests.test_zhaoyun_demo -v
```

测试会在临时目录重新生成 JSON，并检查 schema、媒体元数据、18 点完整性、坐标边界、置信度范围、帧时间、建议帧索引，以及 Web 副本与原输入的字节数/SHA-256 一致性。

## 新细分 TPos 拆片

用户提供的新图是 1024×1024 RGB，物理上没有 alpha 通道（等效 alpha 全为 255），看到的透明棋盘格已烘焙进 RGB。`extract_tpose_parts.py` 以深色/有色轮廓为种子，从画布边界洪泛判定背景，生成二值透明度。这是可重复的估计，无法还原丢失的原始半透明边缘。

```powershell
python scripts\extract_tpose_parts.py
python scripts\build_zhaoyun_tpose_binding.py
python scripts\render_zhaoyun_tpose_preview.py
python -m unittest scripts.tests.test_extract_tpose_parts -v
python -m unittest scripts.tests.test_zhaoyun_tpose_binding -v
```

研究输出在 `demo/zhaoyun/tpose-detailed/`，Web 副本在 `public/demo/zhaoyun/tpose-detailed/`：

- `atlas.png`：保留原空间布局的透明整图；
- `manifest.json`：23 个部件的命名状态、bbox、alpha 和来源限制；
- `spine.atlas`：指向整图区域的 Spine 文本 atlas；
- `parts/*.png`：透明单部件裁图。

绑定生成器读取上述 23 个 bbox，输出
`demo/zhaoyun/zhaoyun.tpose-bind.json` 以及字节一致的 Web 副本
`public/demo/zhaoyun/zhaoyun.tpose-bind.json`。它记录每个附件的本地锚点、
驱动骨骼、绘制层级和缩放范围；当前长枪因为动作骨架尚无枪尾及双握点，
明确降级使用 `wrist_front → weapon_tip`，不能据此判定双手握枪约束通过。

预览渲染器遍历同一真实 107 帧，生成 `zhaoyun.tpose-rig.preview.gif`
以及浏览器可播放的 VP9 左右对照视频 `zhaoyun.tpose-rig.comparison.webm`，并同步至
`public/demo/zhaoyun/`。

根据既有赵云 rig 约定，左列命名为 `back`、右列命名为 `front`；肢体和四个中央圆形关节仍标记 `semanticStatus: layout-heuristic`，并列入 `requiresHumanConfirmationIds`。`screenSide` 始终表示观看者屏幕方向，不与解剖左右混用。
