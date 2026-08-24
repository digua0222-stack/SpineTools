# 赵云 Demo 验证与验收

本文验证 Motion Rig Lab 的最小闭环：真实视频和自动预标注能够打开，异常帧能够被定位，人工能够拖点、锁点、记录原因并导出可继续处理的数据。

验证不用于证明自动预标注已经达到商业动画质量，也不替代逐帧动画审阅。

## 1. 固定输入

测试根目录：`H:\spine_research\MotionRigLab\demo\zhaoyun`

| 文件 | 规格 | SHA-256 |
|---|---|---|
| `assets/银枪三连刺.mp4` | H.264，768 × 768，24 fps，107 帧，4.458333 秒 | `05B9BE105DFE9253506C7346FD7C14233E4201B9FE6D1848EC374A4B61F06FA1` |
| `assets/tpos分离部件.png` | PNG，1024 × 1024 | `2D0AB78F3C273C9C8C065269299B15CC9E14E301A03829066D241E276471F68E` |
| `assets/角色立绘拆分_1.png` | PNG，1024 × 1024 | `CE42587C0BC3863FE9DB8FC2B856410273C89BE740E8A3081B42AC42BA03521B` |
| `assets/tpose_detailed_checkerboard_source.png` | PNG，1024 × 1024，RGB 三通道、无 alpha | `E7321EB57BE54FC8C992C49E4A3A3BD5AA8400664E69EA28A2D44E4EBCBF3A43` |

任何固定输入哈希变化都应视为一组新基线，并重新运行全部验证。

## 2. 自动验证

### 2.1 生成 Demo

```powershell
Set-Location H:\spine_research\MotionRigLab
python -m pip install -r scripts\requirements-motion-rig.txt
python scripts/build_zhaoyun_demo.py
```

预期产物：

- `demo/zhaoyun/zhaoyun.motionrig.json`；
- `demo/zhaoyun/zhaoyun.prelabels.contact-sheet.png`；
- `demo/zhaoyun/assets/SHA256SUMS.json`；
- `public/demo/zhaoyun/{zhaoyun.motionrig.json,zhaoyun.mp4,tpose_parts.png}`；
- 107 帧的 18 点预标注；
- 帧级质量分数和 44 个建议审阅帧。

Web 三件套是浏览器一键 Demo 的输入；可用 `--skip-web-assets` 跳过同步，但此时一键入口不会得到最新产物。

### 2.2 生成透明附件与绑定

```powershell
python scripts/extract_tpose_parts.py
python scripts/build_zhaoyun_tpose_binding.py
npx bun scripts/validate_zhaoyun_tpose_binding.ts
python scripts/render_zhaoyun_tpose_preview.py
```

预期结果：

- `motion-rig/tpose-components-v1` 资产 manifest 记录 23 个互不遗漏的部件；
- `atlas.png` 和 `parts/*.png` 的 alpha 只有 0/255，前景共 171077 像素；
- 18 个启发式命名部件进入 `requiresHumanConfirmationIds`；
- `tpose-bind/v1` 覆盖全部 23 个部件且每个只出现一次；
- `tpose-validation/v1` 覆盖 107 帧，并汇总状态、RMSE、最大误差和超限附件；
- `zhaoyun.tpose-rig.preview.gif` 和 `zhaoyun.tpose-rig.comparison.webm` 分别提供附件绑定动图与浏览器可播放的 VP9 左右对比视频；
- 绑定所引用的骨点都存在于赵云 18 点骨架；
- 研究目录和 `public/demo/zhaoyun/` Web 副本一致。

两种预览媒体用于检查通用附件变换，不是 Spine Runtime 渲染、`.spine` 工程或网格蒙皮结果。

### 2.3 Python 数据测试

```powershell
python -m unittest scripts.tests.test_zhaoyun_demo -v
python -m unittest scripts.tests.test_extract_tpose_parts -v
python -m unittest scripts.tests.test_zhaoyun_tpose_binding -v
```

动作 Demo 与拆片测试合计实测 12/12 通过；绑定生成器另有 4/4 通过。也可用 `python -m unittest discover -s scripts/tests -v` 一次运行全部 16 项。

动作点置信度均值为 0.8560、最小值为 0.0200。

最低断言：

- 帧数为 107，画布为 768 × 768，帧率为 24；
- 关节点名称和骨架边稳定；
- 可见坐标不越界；
- `confidence` 在 0 到 1 之间；
- 每点包含来源和锁定状态；
- 建议帧索引在合法范围内；
- 输入文件引用和 SHA-256 与固定基线一致。

### 2.4 Web 应用测试

推荐的 Bun 路径：

```powershell
bun install --frozen-lockfile
bun run build
bun test tests/unit/motionRigReview.test.ts tests/unit/zhaoyunDemo.test.ts --isolate
bun test tests/unit/tposeBinding.test.ts tests/unit/tposeBindingPreview.test.tsx tests/unit/tposeBindingSection.test.tsx --isolate
bunx playwright install chromium
bun run test:e2e -- tests/e2e/motionRigDemo.spec.ts
```

没有 Bun 的 Windows 环境可使用：

```powershell
npm install
npm run build
npx bun test tests/unit/motionRigReview.test.ts tests/unit/zhaoyunDemo.test.ts --isolate
npx bun test tests/unit/tposeBinding.test.ts tests/unit/tposeBindingPreview.test.tsx tests/unit/tposeBindingSection.test.tsx --isolate
npx playwright install chromium
npm run test:e2e -- tests/e2e/motionRigDemo.spec.ts
```

T-Pose solver 与 UI 定向单测实测 21/21 通过；Python 三组定向测试合计 17/17。去掉最后一条命令中的测试文件参数即可运行完整 Playwright 套件。Motion Rig 的单元测试应覆盖告警分类、阈值边界、骨长容差、持枪距离、锁点状态序列化和 review JSON 导出。

Motion Rig Playwright 仍为两条用例：第一条欢迎页一键 Demo 还验证真实 23-part manifest/atlas、23/23 resolved、组件显隐从 23 变 22 再恢复、绑定 SVG、跳到 Frame 66 后 RMSE 为 13.0 px，以及直接跳到 Frame 52 后能重建 previous-frame fallback；第二条在一次多选中导入 Motion Rig JSON + 本地视频 + 可选 T-Pose，并验证通用项目不会错误加载赵云 T-Pose 或绑定。这里的 `Frame N` 对应从 0 开始的 `frameIndex=N`。

## 3. 浏览器人工验收

先运行：

```powershell
bun run dev
```

在欢迎页点击 `Open Zhao Yun Motion Rig Demo`，然后按下表操作。每一项都应留下截图、导出文件或测试日志之一作为证据。

| 编号 | 操作 | 通过标准 |
|---|---|---|
| UI-01 | 点击 `Open Zhao Yun Motion Rig Demo` | 显示 768 × 768 视频；总帧数为 107；骨架跟随当前帧显示 |
| UI-02 | 打开 `Motion Rig` 面板 | 能看到 `Review queue`、`Current frame` 和阈值控件 |
| UI-03 | 调高 `Confidence threshold` | 低置信告警数量不减少；队列无重复或越界帧 |
| UI-04 | 收紧 `Bone length tolerance` | 骨长突变告警数量不减少；告警能指向具体帧/骨段 |
| UI-05 | 点击异常或 `Next issue` | 视频准确跳到该异常的帧号 |
| UI-06 | 拖动一个未锁节点 | 点位立即更新；切帧返回后仍在；`Ctrl+Z`/重做有效 |
| UI-07 | 对该节点执行 `Lock` | 节点行显示锁定；锁定状态进入 review JSON |
| UI-08 | 填写 `Review notes` | 文本进入 review JSON，中文不乱码 |
| UI-09 | 使用 `Copy review JSON` | 剪贴板内容是合法 JSON，包含阈值、锁点和备注 |
| UI-10 | 保存项目并导出标签 JSON | 关闭后重新打开，点位修改仍存在；导出坐标与画布一致 |
| UI-11 | 播放整个动作 | 没有明显的单帧长距离跳点；前后肢身份在遮挡后保持一致 |
| UI-12 | 检查 T-Pose 交接 | 能明确指出 18 点到目标骨骼/武器的映射；未把 T-Pose 当作动作帧 |

## 4. T-Pose 绑定专项验收

| 编号 | 操作 | 通过标准 |
|---|---|---|
| TP-01 | 展开 `T-Pose Binding` | 显示 23 parts，atlas 和绑定 manifest 加载无错误 |
| TP-02 | 检查首帧摘要 | 23/23 resolved；12 solved、11 degraded、0 unresolved；RMSE 显示 0.7 px；missing anchors 为 0 |
| TP-03 | 在 `Components` 逐个选择 | 共 23 个唯一 ID；每行显示 bone、slot、z 和 solve 状态 |
| TP-04 | 隐藏/显示单个组件 | `Bound character preview` 对应层即时消失/恢复，不影响骨点数据 |
| TP-05 | 切换 `Binding` / `Overlays` | 可整体隐藏附件或诊断叠层 |
| TP-06 | 切换 `Bones` / `Anchors` / `Errors` | 三类诊断图层分别响应；选择组件后显示其锚点误差 |
| TP-07 | 逐帧检查武器 | 99 帧 solved；Frame 17/18/20/22/24/28/38/58 因 `weapon_tip` 不可见而 degraded；没有 fallback/unresolved |
| TP-08 | 检查透明边缘和遮挡 | 记录棋盘残色、封闭孔、部件命名和 z 顺序问题，不把二值蒙版当原始 alpha |
| TP-09 | 运行全序列 validation | 107 帧全部可解析；报告 mean/max RMSE、状态总数、8 px 超限帧和最差帧，不因 23/23 resolved 忽略高误差 |

TP-02 的 11 个 degraded 主要是单锚点附件按设计使用固定缩放与 `driverNodes` 方向，并非加载失败。TP-07 的武器虽然其余 99 帧可由 `wrist_front` + `weapon_tip` 两点求解，但这仍不是双手握枪或枪身完整约束。

当前 TP-09 基线：107/107 帧均为 23/23 resolved，累计 solved 1266、degraded 1189、fallback 6、unresolved 0；平均 RMSE 9.6672 px，最大 RMSE 25.3387 px（Frame 74），Frame 17–106 共 90 帧超过 8 px。`resolved` 只代表存在可绘制变换，不代表视觉正确。Frame 52 的 1 个 fallback 可用于验证直接跳帧与顺序播放得到同样结果。

## 5. 赵云动作专项抽检

至少检查以下区段，而不是只看动作首帧：

1. 预备姿势：骨盆、躯干、颈、头在同一合理链条上；
2. 第一次前刺：持枪手与枪尖连续，枪尖不跳到身体另一侧；
3. 回收/交叉：前后手腕和肘不交换身份；
4. 第二次位移：双膝/脚踝在遮挡后保持原骨骼归属；
5. 最远前刺：高速模糊时重点复核 `weapon_tip` 和手腕；
6. 收招：末帧接首帧时没有根节点或躯干突跳。

对于自动结果，每段至少抽检首、中、末三帧；所有告警帧必须逐项确认。即使没有告警，也要播放观察连续性，因为“连续地跟错”不一定触发单帧异常。

## 6. 数据交接验收

通过 UI 验收后，检查交付目录至少包含：

```text
source/
  银枪三连刺.mp4
  tpos分离部件.png
labels/
  zhaoyun_three_thrust_vNNN.slp
  zhaoyun_three_thrust_vNNN.labels.json
  zhaoyun_three_thrust_vNNN.review.json
reports/
  validation.md
  screenshots/
```

下游求解前再确认：

- 所有坐标为视频像素坐标，原点在左上；
- 帧号从 0 开始还是从 1 开始已写入元数据；
- 前/后肢命名没有被屏幕左右误解；
- 锁点由下游读取并保护；
- T-Pose 骨骼原点、父子关系和部件层级另有配置；
- 资产 manifest 与绑定 manifest 没有混用；
- 仍需人工处理的柔性部件和遮挡已列明。

## 7. 通过标准

MVP 可判定通过，当且仅当：

- Demo 生成与自动测试全部通过；
- 浏览器可完成 UI-01 至 UI-10；
- UI-11 没有明显未说明的跳点；
- UI-12 的 T-Pose 映射边界已写清楚；
- TP-01 至 TP-09 已执行，启发式命名、alpha 缺陷和高误差帧有人工结论；
- 保存后的项目能够重新打开；
- 三类交付文件（项目、标签、review）均可读取；
- 已知缺陷不会被描述为“已经自动解决”。

当前已经实现刚性附件级 T-Pose 绑定与预览，但完整 Spine 骨骼层级、网格蒙皮和导出仍是后续工作。这不影响“人工纠偏 + 组件绑定预览 MVP”通过，但验收报告不得把它描述为最终 Spine 动画。

当前构建的实测状态和未完成项见 [VALIDATION_REPORT.md](VALIDATION_REPORT.md)。

## 8. 失败判定与记录模板

以下任一情况应判定当前构建失败：

- 视频帧号与 JSON 帧号错位；
- 拖点后保存/重开丢失；
- 锁定状态导出丢失；
- 导出 JSON 无法解析或坐标越界；
- 告警点击跳到错误帧；
- 23 个附件缺失、重复或引用不存在的骨点；
- 通用项目错误加载赵云绑定，或绑定 atlas URL 无法解析；
- 同一版本输入哈希不一致却仍沿用旧验收结论。

建议用以下格式记录：

```markdown
构建：<git commit>
日期：<YYYY-MM-DD>
环境：<OS / browser / Bun / Python>
输入哈希：<match / mismatch>
自动测试：<pass / fail + log path>
人工验收：<UI-01 ... UI-12>
保留问题：<frame / node / symptom / decision>
导出物：<absolute paths>
结论：<MVP pass / fail>
```
