# Motion Rig Lab 赵云 Demo 实测报告

- 测试日期：2026-08-24
- 测试对象：赵云“银枪三连刺”视频、T-Pose 分离图、Motion Rig 人工纠偏编辑器 MVP

## 1. 结论

编辑器的技术 MVP 已完成并通过定向自动测试：真实 Demo 能一键载入，107 帧/18 点/T-Pose 正常显示，异常导航、锁点、中文备注、review JSON 和画布拖点/撤销可用。新增管线还能从无 alpha 的细分图恢复 23 个透明部件，生成 `tpose-bind/v1`，并在 `Motion Rig` 面板预览附件随当前帧骨点运动。

这不代表“视频到完整骨骼 Spine”已经通过。自动预标注仍有肉眼可见漂移；保存后重开和全动作逐帧 QC 尚未完成。新增绑定是逐附件的二维刚性求解和 UI 预览，不包含完整 Spine 父子骨骼、网格蒙皮、约束或最终导出。当前结果应定义为“可用于人工纠偏和组件绑定佐证的闭环”，不是可直接发布的最终动画。

## 2. 自动测试结果

| 项目 | 结果 | 已验证内容 |
|---|---|---|
| 静态与生产检查 | 通过 | App/test TypeScript、ESLint 和 Vite production build |
| Python Demo 管线 | 6/6 通过 | 真实媒体元数据、schema、107 帧、18 点、坐标/置信度范围、建议帧与哈希 |
| T-Pose 透明拆片与预览产物 | 7/7 通过 | RGB/棋盘检测、23 部件、二值 alpha、命名状态、确定性输出、Web 副本，以及 GIF/WebM 的 107 帧时基 |
| T-Pose 绑定生成器 | 4/4 通过 | 23 部件完整覆盖、裁图/锚点边界、18 点引用和 UTF-8 确定性往返 |
| Motion Rig + Demo loader 单元测试 | 13/13 通过 | 异常分析、阈值/骨长/持枪规则、锁点/备注序列化、JSON 解析和 Labels 转换 |
| T-Pose solver + UI 单元测试 | 21/21 通过 | schema、单/双/多锚点求解、缩放、重合锚点、降级/回退、误差摘要、组件预览、直接跳帧回退、异步加载与 atlas 失败 |
| Motion Rig Playwright E2E | 2/2 通过 | 一键 Demo、真实 23-part 绑定/atlas、23/23 resolved、组件显隐、Frame 66 RMSE、Frame 52 fallback、审阅操作，以及通用导入隔离 |

Playwright 还确认复制结果的 schema 为 `motion-rig-review@1`，坐标系为图像像素/左上原点，且 Frame 1 的 `root` 锁点和中文备注进入 manifest。首条用例加载真实 23-part 绑定和 atlas，检查 23/23 resolved、绑定 SVG、单层显隐 23→22→23，跳到 Frame 66 断言 RMSE 13.0 px，再直接跳到 Frame 52 确认 previous-frame fallback 可重建。第二条从同一个多选入口导入 JSON、本地视频和可选 T-Pose，确认通用项目进入 107 帧/18 点工作区，且不会误用赵云 T-Pose/绑定。本文的 `Frame N` 均对应从 0 开始的 `frameIndex=N`。

这些是浏览器集成与结构断言，不是逐像素视觉相似度证明；最终画面质量仍以人工抽检和全序列误差为准。

## 3. 浏览器实测

在应用内浏览器中完成以下人工操作：

- 从欢迎页载入赵云 Demo；
- 在画布上拖动 `root`；
- 项目标题出现 `*`，表明编辑已进入脏状态；
- 执行 `Ctrl+Z` 撤销拖点。

这证明了最关键的人工纠偏交互和撤销链路可工作。本轮没有把“切帧返回后仍在”以及“保存、关闭、重新打开后仍在”合并进同一人工测试，因此不能据此宣称完整持久化验收已经通过。

T-Pose 组件预览另做了浏览器抽检：Frame 0（首帧）和 Frame 1 均为 23/23 resolved、RMSE 显示 0.7 px，组装角色视觉合理；Frame 11 RMSE 显示 1.5 px，仍较合理；Frame 66 显示 13.0 px、Frame 92 显示 21.7 px，后段可见肢体和比例错位。预览正确地把输入骨点漂移转化为可观察的角色问题，没有掩盖问题。

## 4. Demo 数据基线

- 视频：768 × 768，24 fps，107 帧；
- 骨架：18 点/帧；
- 自动预标注：前向/反向金字塔 Lucas–Kanade 光流基线；
- 点置信度均值：0.8560；
- 点置信度最小值：0.0200；
- 生成器建议人工复核：44 帧。

置信度是审阅排序信号，不是正确率。实测预览中仍存在明显漂移，特别是武器快速移动、肢体交叉和遮挡区段；这些帧必须人工拖点或由后续局部重跟踪器重新计算。

## 5. T-Pose 透明拆片与绑定状态

新输入 `tpose_detailed_checkerboard_source.png` 是 1024 × 1024 RGB 三通道图，物理上没有 alpha，等效 alpha 为 255..255；可见棋盘已烘焙在 RGB 中。确定性提取器生成 23 个附件、0/255 二值 alpha 和 171077 个前景像素。明显部件为 weapon、helmet、cape、head、torso；其余 18 个 back/front 肢体与护甲名来自布局启发式，仍需人工确认。

首帧绑定结果为 23/23 resolved：12 solved、11 degraded、0 fallback、0 unresolved；RMSE 0.7298 px，最大锚点误差 3.5685 px，missing anchors 为 0。单锚点附件的 degraded 是约束强度提示，不代表该层没有显示。

全 107 帧 `tpose-validation/v1` 报告位于 `demo/zhaoyun/zhaoyun.tpose-validation.json`：每帧都能得到 23/23 可绘制附件，但平均 RMSE 为 9.6672 px，最大 RMSE 为 25.3387 px（Frame 74）；以 8 px 为容差，Frame 17–106 共 90 帧超限。累计状态为 solved 1266、degraded 1189、fallback 6、unresolved 0。Frame 52 为 11 solved、11 degraded、1 fallback、0 unresolved，RMSE 3.2804 px；UI 直接跳入该帧也会从 Frame 0 顺序重算得到同一回退。可解析/可绘制不等于视觉质量合格。

UI 提供 `Binding`、`Overlays`、`Bones`、`Anchors`、`Errors` 开关，以及 `Source T-Pose parts`、`Components` 和 `Bound character preview`。组件行显示显隐、bone、slot、z 和 solve 状态。当前 UI 是检查器，不会交互式改写 anchor/pivot。

## 6. Weapon constraints 状态

当前赵云骨架只有 `weapon_tip`，没有 `weapon_tail`、`front_grip` 和 `rear_grip`。面板因此显示 `Weapon constraints: Needs anchors`，这是预期结果。

绑定 manifest 暂用 `wrist_front` 和 `weapon_tip` 驱动整支武器：107 帧中 99 帧 solved，Frame 17、18、20、22、24、28、38、58 因 `weapon_tip` 不可见而退化为单锚点，8 帧均为 degraded，没有 fallback/unresolved。这足以做烟雾测试预览，但在补齐枪尾和两个握点以前，系统无法证明双手握持和枪身接触稳定，武器约束仍不能标为生产通过。

## 7. 验收清单状态

| 范围 | 状态 | 说明 |
|---|---|---|
| UI-01 至 UI-05 | 已自动覆盖 | Demo/T-Pose/面板载入与 `Next issue` 已通过 E2E |
| UI-06 | 部分通过 | 已实测拖 `root`、脏状态和 `Ctrl+Z`；跨帧保持尚未单独记录 |
| UI-07 至 UI-09 | 已自动覆盖 | 锁点、中文备注和剪贴板 JSON 已通过 E2E |
| UI-10 保存、关闭、重开 | 待完成 | 尚未验证 `.slp` 和标签 JSON 的完整往返 |
| UI-11 全动作人工 QC | 未通过生产验收 | 后段骨点漂移已由绑定预览暴露；90 帧超过 8 px，需纠偏后重跑 |
| UI-12 T-Pose 绑定 | 部分完成 | 23 个刚性附件 manifest、求解器与 UI 预览已完成；全序列误差未通过，完整 Spine 层级、插槽皮肤、网格权重和导出仍待完成 |

## 8. 后续完成条件

要把当前结论升级为“赵云骨骼动画验收通过”，至少还需：

1. 人工处理 44 个建议帧，并播放检查未告警但连续跟错的区段；
2. 增加枪尾和双握点，替换当前 `wrist_front` → `weapon_tip` 降级武器绑定并重新验证 Weapon constraints；
3. 完成 `Save As`、关闭、重开、标签 JSON 和 review JSON 的往返测试；
4. 把现有附件级映射升级为可导出的父子骨骼、原点、层级、插槽和皮肤；
5. 对披风、发梢、枪穗等柔性部件补辅助骨/素材；
6. 输出并对比最终动画，再做视觉验收和许可复核。

在以上项目完成前，不应把本报告解释为完整 Spine 产物已经生成或通过质量验收。
