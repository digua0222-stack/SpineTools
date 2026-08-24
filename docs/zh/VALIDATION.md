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

### 2.2 Demo 数据测试

```powershell
python -m unittest scripts.tests.test_zhaoyun_demo -v
```

本基线实测结果为 6/6 通过；点置信度均值为 0.8560、最小值为 0.0200。

最低断言：

- 帧数为 107，画布为 768 × 768，帧率为 24；
- 关节点名称和骨架边稳定；
- 可见坐标不越界；
- `confidence` 在 0 到 1 之间；
- 每点包含来源和锁定状态；
- 建议帧索引在合法范围内；
- 输入文件引用和 SHA-256 与固定基线一致。

### 2.3 Web 应用测试

推荐的 Bun 路径：

```powershell
bun install --frozen-lockfile
bun run build
bun test tests/unit/motionRigReview.test.ts tests/unit/zhaoyunDemo.test.ts --isolate
bunx playwright install chromium
bun run test:e2e -- tests/e2e/motionRigDemo.spec.ts
```

没有 Bun 的 Windows 环境可使用：

```powershell
npm install
npm run build
npx bun test tests/unit/motionRigReview.test.ts tests/unit/zhaoyunDemo.test.ts --isolate
npx playwright install chromium
npm run test:e2e -- tests/e2e/motionRigDemo.spec.ts
```

去掉最后一条命令中的测试文件参数即可运行完整 Playwright 套件。Motion Rig 的单元测试应覆盖告警分类、阈值边界、骨长容差、持枪距离、锁点状态序列化和 review JSON 导出。

赵云定向 E2E 包含两条路径：欢迎页一键 Demo，以及在一次多选中导入 Motion Rig JSON + 本地视频 + 可选 T-Pose。后者还应验证无参照图的通用项目不会错误显示赵云 T-Pose。

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

## 4. 赵云动作专项抽检

至少检查以下区段，而不是只看动作首帧：

1. 预备姿势：骨盆、躯干、颈、头在同一合理链条上；
2. 第一次前刺：持枪手与枪尖连续，枪尖不跳到身体另一侧；
3. 回收/交叉：前后手腕和肘不交换身份；
4. 第二次位移：双膝/脚踝在遮挡后保持原骨骼归属；
5. 最远前刺：高速模糊时重点复核 `weapon_tip` 和手腕；
6. 收招：末帧接首帧时没有根节点或躯干突跳。

对于自动结果，每段至少抽检首、中、末三帧；所有告警帧必须逐项确认。即使没有告警，也要播放观察连续性，因为“连续地跟错”不一定触发单帧异常。

## 5. 数据交接验收

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
- 仍需人工处理的柔性部件和遮挡已列明。

## 6. 通过标准

MVP 可判定通过，当且仅当：

- Demo 生成与自动测试全部通过；
- 浏览器可完成 UI-01 至 UI-10；
- UI-11 没有明显未说明的跳点；
- UI-12 的 T-Pose 映射边界已写清楚；
- 保存后的项目能够重新打开；
- 三类交付文件（项目、标签、review）均可读取；
- 已知缺陷不会被描述为“已经自动解决”。

若尚未实现自动局部重跟踪、Spine 骨骼求解或 T-Pose 绑定，不影响“人工纠偏编辑器 MVP”通过，但必须在验收报告中明确标为后续工作。

当前构建的实测状态和未完成项见 [VALIDATION_REPORT.md](VALIDATION_REPORT.md)。

## 7. 失败判定与记录模板

以下任一情况应判定当前构建失败：

- 视频帧号与 JSON 帧号错位；
- 拖点后保存/重开丢失；
- 锁定状态导出丢失；
- 导出 JSON 无法解析或坐标越界；
- 告警点击跳到错误帧；
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
