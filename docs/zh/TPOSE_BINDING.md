# T-Pose 透明拆片与组件绑定

本模块把用户提供的 1024 × 1024 细分 T-Pose 图转换成透明附件，再用 `tpose-bind/v1` 将附件刚性映射到 Motion Rig 的逐帧骨点。它解决“这些像素部件如何跟随骨点”的可视化佐证，不等同于 Spine 蒙皮或最终动画导出。

## 1. 四类数据不要混用

| 数据 | schema/格式 | 作用 |
|---|---|---|
| 动作骨点 | `motion-rig/v1` | 107 帧中的 18 个目标点，坐标为视频像素 |
| T-Pose 资产清单 | `motion-rig/tpose-components-v1` | 23 个透明裁图的 bbox、像素、命名可信度和 atlas 区域 |
| T-Pose 绑定 | `tpose-bind/v1` | 每个附件的 rect、pivot、anchors、bone、slot、z 和求解策略 |
| 全序列验证 | `tpose-validation/v1` | 107 帧的求解状态、误差、超限附件和最差帧 |

资产清单只说明“图中分出了什么”，绑定 manifest 才说明“部件跟随哪个动作点”。`spine.atlas` 只描述纹理区域，不包含骨骼时间线，也不是 `.spine` 工程。

## 2. 为什么需要重建透明度

源文件：`demo/zhaoyun/assets/tpose_detailed_checkerboard_source.png`

- 分辨率：1024 × 1024；
- 通道：RGB 三通道；
- SHA-256：`e7321eb57be54fc8c992c49e4a3a3bd5aa8400664e69ea28a2d44e4ebcbf3a43`；
- 实际 alpha：没有 alpha 通道，等效为 255..255；
- 棋盘格：已烘焙到 RGB，并不代表真实透明。

提取器以暗色/有色轮廓为种子，经形态学处理和从画布边缘开始的背景洪泛，估算前景二值蒙版。输出 alpha 只有 0 和 255，前景为 171077 像素。

这是一种可重复估计，不可能从单张烘焙图恢复已经丢失的原始半透明抗锯齿。边缘可能残留棋盘颜色，封闭的亮色透明孔也可能被当成前景。

## 3. 生成命令

从仓库根目录运行：

```powershell
Set-Location H:\spine_research\MotionRigLab
python -m pip install -r scripts\requirements-motion-rig.txt
python scripts\extract_tpose_parts.py
python scripts\build_zhaoyun_tpose_binding.py
npx bun scripts\validate_zhaoyun_tpose_binding.ts
python scripts\render_zhaoyun_tpose_preview.py
```

`extract_tpose_parts.py` 先生成透明附件和资产清单，`build_zhaoyun_tpose_binding.py` 再读取资产清单生成绑定，TypeScript 脚本遍历 107 帧生成验证报告，最后的 Python 渲染器输出 GIF 与 VP9 左右对比 WebM。必须按此顺序执行。

拆片脚本可用参数：

```text
--source <png>
--output-dir <research-output>
--public-dir <web-output>
--skip-public
--min-area <pixels>
```

绑定脚本可用参数：

```text
--components <asset-manifest.json>
--output <binding.json>
--public-output <web-binding.json>
```

## 4. 输出路径

研究产物：

```text
demo/zhaoyun/tpose-detailed/
  atlas.png
  manifest.json
  spine.atlas
  parts/*.png
demo/zhaoyun/zhaoyun.tpose-bind.json
demo/zhaoyun/zhaoyun.tpose-validation.json
demo/zhaoyun/zhaoyun.tpose-rig.preview.gif
demo/zhaoyun/zhaoyun.tpose-rig.comparison.webm
```

浏览器副本：

```text
public/demo/zhaoyun/tpose-detailed/
  atlas.png
  manifest.json
  spine.atlas
  parts/*.png
public/demo/zhaoyun/zhaoyun.tpose-bind.json
public/demo/zhaoyun/zhaoyun.tpose-validation.json
public/demo/zhaoyun/zhaoyun.tpose-rig.preview.gif
public/demo/zhaoyun/zhaoyun.tpose-rig.comparison.webm
```

绑定 manifest 中 atlas 使用相对路径 `tpose-detailed/atlas.png`，因此移动文件时要保持这个相对结构。
GIF 和 VP9 左右对比 WebM 是附件绑定的检查渲染，不是 Spine Runtime 输出，也不包含 `.spine` 工程或网格蒙皮。GIF 采用 40/50 ms 交替帧时长逼近 24 fps，107 帧总时长 4.460 秒；WebM 为 24 fps、4.458 秒。

## 5. 23 个附件

明显语义的 5 个部件：

```text
weapon, helmet, cape, head, torso
```

按既有赵云 rig 约定命名的 18 个布局启发式部件：

```text
shoulder_{back,front}
upper_arm_{back,front}
forearm_{back,front}
hand_{back,front}
hip_cover_{back,front}
thigh_{back,front}
knee_cover_{back,front}
shin_{back,front}
foot_{back,front}
```

源图屏幕左列暂映射为 `back`，屏幕右列暂映射为 `front`。这 18 个 ID 全部记录在 `requiresHumanConfirmationIds`，必须结合视频和角色约定人工确认，不能把屏幕方向直接当作解剖左右。

## 6. 组件、附件与骨骼的区别

- 组件是提取出的像素连通区域；
- 附件是带 rect、pivot、anchors、slot 和 z 的可绘制层；
- Motion Rig 骨点/骨段提供当前帧几何驱动；
- `bone` 当前是附件所属驱动的语义字段，不会自动建立 Spine 父子层级；
- `slot` 和 `z` 控制当前预览的绘制顺序，不是完整 Spine skin/slot 工程。

它们不是一一对应关系。同一骨点可以驱动肢段和护甲等多个附件；有些附件只有一个位置锚点，需要额外用 `driverNodes` 提供朝向。当前求解仍是每个附件独立的二维刚性/相似变换，没有跨附件层级传播和网格变形。

## 7. `tpose-bind/v1` 求解规则

- 两个锚点：求平移、旋转和统一缩放；
- 三个及以上锚点：加权最小二乘相似变换；
- `similarity-2d` 只有一个锚点：位置可对齐，比例/方向来自固定值、前帧或 `driverNodes`，状态标为 `degraded`；`translation` 模式只要求一个锚点；
- 零个锚点：核心求解 API 有回退变换时为 `fallback`，否则 `unresolved`；
- `scale.min/max/fixed` 和全局 `scaleClamp` 防止异常伸缩；
- 每个附件输出 RMSE、最大锚点误差和 used anchor 数。

当前 UI 每次切帧或直接跳帧时，都会从 Frame 0 顺序重算到目标帧，并把上一帧变换传给下一帧。因此它与离线 validator 使用相同的确定性 previous-frame fallback，不依赖用户此前的浏览顺序；只有从首帧起都没有可用变换时才会显示 `unresolved`。

这对 107 帧 Demo 的开销很小，但当前复杂度随目标帧与附件数线性增长。接入数千或数万帧的通用项目以前，应增加按 manifest/frames 失效的前缀缓存或增量缓存。

## 8. 编辑器预览

打开内置赵云 Demo，在 `Motion Rig > T-Pose Binding` 中检查：

- `Binding`：显示/隐藏全部绑定附件；
- `Overlays`：显示/隐藏全部诊断叠层；
- `Bones`、`Anchors`、`Errors`：分别控制骨架、锚点和误差；
- `Source T-Pose parts`：透明 atlas 和选中裁图；
- `Components`：附件显隐、bone、slot、z、solve 状态；
- `Bound character preview`：当前帧组件合成。

首帧实测：23/23 resolved，12 solved、11 degraded、0 fallback、0 unresolved，RMSE 0.7298 px，最大误差 3.5685 px，missing anchors 为 0。

下文的 `Frame N` 与 UI 和 JSON 一致，表示从 0 开始的 `frameIndex=N`；本 Demo 的有效范围是 Frame 0–106。

全序列验证产物为 `demo/zhaoyun/zhaoyun.tpose-validation.json`（Web 副本同名），schema 为 `tpose-validation/v1`。当前基线 107 帧全部可解析且 23/23 resolved，累计 solved 1266、degraded 1189、fallback 6、unresolved 0；平均 RMSE 9.6672 px，最大 RMSE 25.3387 px，最差为 Frame 74。按 8 px 容差，Frame 17–106 共 90 帧超限。

浏览器抽检：Frame 0（首帧）和 Frame 1 的 RMSE 均显示 0.7 px、角色视觉合理；Frame 11 为 1.5 px，仍较合理；Frame 66 为 13.0 px、Frame 92 为 21.7 px，已出现明显肢体和比例错位。这里的高误差主要暴露动作骨点漂移；`resolved` 只表示求解器能产生变换，不表示动画质量合格。直接跳到 Frame 52 时，UI 仍为 23/23 resolved，并显示 1 个 previous-frame `fallback`，与全序列 validator 一致。

组件列表中的选择和显隐只影响检查视图，不会回写 manifest。需要修正 pivot、anchor、slot 或 z 时，编辑生成器/JSON 并重新载入。

## 9. 武器降级边界

当前 18 点骨架只有 `weapon_tip`，没有 `weapon_tail`、`front_grip`、`rear_grip`。绑定暂用 `wrist_front` 和 `weapon_tip` 两个代理锚点驱动整支武器。

全 107 帧结果：99 solved、8 degraded、0 fallback、0 unresolved。降级帧为 Frame 17、18、20、22、24、28、38、58，原因都是 `weapon_tip` 不可见，只剩 `wrist_front` 单锚点。

这只能证明武器图层大致跟随前腕与枪尖，不能证明双手握持、枪尾轨迹或枪身刚性。生产绑定应增加枪尾与两个握点，再重新求解和验收。

## 10. 测试

```powershell
python -m unittest scripts.tests.test_extract_tpose_parts -v
python -m unittest scripts.tests.test_zhaoyun_tpose_binding -v
npx bun test tests/unit/tposeBinding.test.ts tests/unit/tposeBindingPreview.test.tsx tests/unit/tposeBindingSection.test.tsx --isolate
npx bun scripts/validate_zhaoyun_tpose_binding.ts
npm run build
```

当前实测：拆片与预览产物 7/7、绑定生成器 4/4、T-Pose solver + UI 21/21，App/test TypeScript、ESLint 和 Vite production build 均通过。

Motion Rig Playwright 2/2 已通过：一键 Demo 用例覆盖真实 23-part manifest/atlas、23/23 resolved、绑定 SVG、单组件显隐 23→22→23、Frame 66 RMSE 13.0 px，以及直接跳到 Frame 52 后仍能重建 previous-frame fallback；通用导入用例确认不会误加载赵云绑定。这些结构断言不替代逐像素视觉验收，最终质量仍需按 [VALIDATION.md](VALIDATION.md) 的 TP-01 至 TP-09 人工确认。

## 11. 仍未完成

- 交互式 pivot/anchor/slot/z 编辑器；
- 自动骨骼父子层级与 IK/transform constraints；
- 网格、权重和柔性部件形变；
- 枪尾、双握点和双手接触约束；
- 完整 Spine JSON/二进制时间线导出与运行时对比；
- Spine Editor 专有 `.spine` 工程生成。
