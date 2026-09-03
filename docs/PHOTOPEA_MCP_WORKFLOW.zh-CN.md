# Photopea MCP：分层 PSD 与 Spine 初始绑定工作流

本流程将已审阅的切分多边形、像素归属修正和遮挡补绘配方交给真实 Photopea MCP 执行，再从 PSD 导出 Spine 区域附件与初始骨架。它可以重放人工判断后的分层流程；目前不会自动理解任意新角色的身体结构。

2026-09-03 在 Windows / Python 3.12.12 上使用仓库的赵云原图跑通。该图是 498 × 345 的透明 PNG，长枪横穿身体，双手遮挡枪杆。最终为 29 个可见部件、1 个隐藏参考层、30 根骨骼、29 个插槽、2 条双臂 IK 约束。没有使用本地生成模型；此流程不要求 CUDA GPU。Photopea 首次加载编辑器仍需要网络，不能将“本地 MCP”理解为完全离线编辑器。

## 文件入口

| 文件 | 用途 |
| --- | --- |
| [仓库技能](../.agents/skills/photopea-spine/SKILL.md) | 后续 Codex 任务的操作入口 |
| [replay.py](../scripts/photopea/replay.py) | MCP 切分、补绘、PSD 导出、Spine 导出及验证 |
| [run_server.py](../scripts/photopea/run_server.py) | 独立上游 checkout 的 Windows 兼容启动器 |
| [verify_runtime.py](../scripts/photopea/verify_runtime.py) | 官方运行库加载、约束检查、实际渲染和打包 |
| [赵云 recipe.json](../examples/photopea/zhaoyun/recipe.json) | 切分、边缘归属、绘制顺序与隐藏补绘 |
| [赵云 rig.json](../examples/photopea/zhaoyun/rig.json) | 初始骨骼、插槽、双臂 IK、检查动画 |
| [历史验收数据](../examples/photopea/zhaoyun/expected.json) | 首次成功任务的实测记录 |
| [脚本复跑验收](../examples/photopea/zhaoyun/replay-verification.json) | 本次仓库入口重新执行的运行库、启动器和测试结果 |
| [已完成样例包](../_artifacts/photopea/zhaoyun-20260903.zip) | PSD、JSON、PNG、GIF、离线预览和使用说明 |

## MCP 与运行依赖

上游为 [sportiz91/photopea-api](https://github.com/sportiz91/photopea-api)，首次验证使用提交 `a3829bc3103f594023a0fa0356386a75c36940d0`。上游代码和浏览器不提交到本仓库。使用独立 Python 环境，避免改变其他图像工具的依赖。

```powershell
# 在 SpineTools 根目录；Python 3.12 已安装。
python -m venv .venv-photopea
& .\.venv-photopea\Scripts\python.exe -m pip install -r scripts/photopea/requirements.txt
& .\.venv-photopea\Scripts\python.exe -m playwright install chromium

# 放到自己的第三方软件目录，不放入本仓库的提交。
git clone https://github.com/sportiz91/photopea-api.git "D:\tools\photopea-api"
git -C "D:\tools\photopea-api" checkout a3829bc3103f594023a0fa0356386a75c36940d0
```

复跑脚本读取已经存在的 Codex TOML 中的 `[mcp_servers.photopea]`，不修改配置、不记录该配置的环境变量。可通过 `--codex-config` 和 `--mcp-server` 选择其他配置路径或 STDIO 服务名。服务配置应指向独立环境的 Python，并启动本仓库启动器或已有的兼容启动器。例如，将下列路径替换为真实绝对路径：

```toml
[mcp_servers.photopea]
command = 'D:\work\SpineTools\.venv-photopea\Scripts\python.exe'
args = ['D:\work\SpineTools\scripts\photopea\run_server.py', '--upstream', 'D:\tools\photopea-api']
cwd = 'D:\tools\photopea-api'
startup_timeout_sec = 30
tool_timeout_sec = 180

[mcp_servers.photopea.env]
PHOTOPEA_ENGINE = 'chromium'
PHOTOPEA_HEADLESS = '1'
PYTHONUNBUFFERED = '1'
```

也可以继续使用本机已经验证的 `local/run_server.py`，无需替换现有服务。此配置段不是完整配置文件，不应覆盖其他设置。

上游在当次源码中声明 MCP 2.x，而代码提供 MCP 1.x 的 FastMCP 回退。这里单独固定已验证的 MCP 1.29.1、Playwright 1.62.0、NumPy 2.5.2、Pillow 12.3.0、psd-tools 1.19.0、SciPy 1.18.1。启动器不修改上游源码。版本升级后应重新执行本案例验证，不能仅以工具发现成功作为兼容证明。

## 完整复跑

下面的命令依次执行真实 MCP 绘图、PSD 导出、附件导出及运行库验证。任选一条适合本机环境的 Python 路径。

```powershell
# 只为实际 Spine 运行库验证安装依赖。不会安装到仓库主项目或运行包脚本。
npm ci --prefix scripts/photopea --ignore-scripts --no-audit --no-fund

& .\.venv-photopea\Scripts\python.exe scripts/photopea/replay.py `
  --case examples/photopea/zhaoyun `
  --output output/photopea-zhaoyun
```

如果已存在可用的 Photopea Python 环境，直接用该环境的 Python 执行命令即可，无需再次创建环境。MCP 服务进程与调用脚本的解释器都需满足各自依赖。其他操作系统可使用相应 venv 的 `bin/python`；完整复跑只在 Windows 实测，Linux / macOS 不作已验证承诺。

可分阶段恢复：

```powershell
python scripts/photopea/replay.py --output output/photopea-zhaoyun --stage psd
python scripts/photopea/replay.py --output output/photopea-zhaoyun --stage export
python scripts/photopea/replay.py --output output/photopea-zhaoyun --stage verify
```

`psd` 只需要 Python 与已配置的 MCP；`verify` 另外需要 npm 依赖和 Playwright Chromium。`export` 与 `verify` 使用同一输出目录中前一阶段的结果。重跑会覆盖该目录中本流程的同名文件，建议每次实验使用新输出目录。不会删除目录中的其他文件。

成功结果包含：

- `zhaoyun-spine.psd`、`zhaoyun-setup.png`。
- `images/*.png`、`zhaoyun-spine.json`、`parts-manifest.json`。
- 部件总览、骨骼预览、实际动作对照 PNG 和 GIF。
- `preview.html`：内嵌图片、骨架及官方运行库，双击可离线预览。
- `validation.json`、`zhaoyun-spine-package.zip`。
- `work/`：工具 schema、MCP 调用记录、服务日志、切分和清理阶段 PSD/PNG，以及各阶段验证报告。日志只保留在本地输出目录。

## 怎样建立新角色配方

`recipe.json` 负责图像侧，`rig.json` 负责骨架侧。换图时创建新目录并审阅新参数，不要只替换哈希绕过原图校验。

| 字段 | 含义 |
| --- | --- |
| `source` / `sourceSize` / `sourceSHA256` | 相对于配方目录的原图、画布尺寸和已审阅文件哈希 |
| `cuts` / `remaining` | 按遮挡顺序切取的多边形，以及最后剩余部件 |
| `transfers` | 把误归属的像素从 source 层转移并合并到 target 层 |
| `order` | 从后到前的完整图层顺序，每个部件恰好出现一次 |
| `patches` | 在原部件下面绘制连接区；`colors` 指局部渐变，`fills` 指指定多边形色带 |
| `originImage` / `padding` | Spine 原点在原图中的坐标，以及附件透明留边 |
| `connectedParts` | 必须通过 alpha 连通检查的主要连接部件 |
| `grips` | 运行验证时要比较的末端骨骼与目标骨骼 |

多边形坐标以原图左上为原点，x 向右、y 向下。赵云的 L / R 是画面左右。手部先切，随后武器；膝甲应先于胫甲切，避免膝盖被分成两半。保留一份隐藏原图参考层。

先检查分层重组是否还原原图，再修正边缘归属。本案例清理过披风碎片、残留在裙甲和枪杆上的肤色像素，以及头盔/护肩边缘。固定配方保存的是已人工确认的转移区域，不会对另一角色执行同样的语义归属。

接下来补齐被双手遮住的两段枪杆，以及肩、肘、腰、膝等连接处。补绘先位于原像素下面，并裁剪到“本层或前景部件的近乎不透明原图区域”，再合并。这能保持初始姿势像素不变，但同时限制了隐藏结构补全的范围；不能将它当作完整的解剖或布料恢复。

`rig.json` 采用 Spine 4.2 的骨骼、插槽、约束与动画结构。父骨骼先于子骨骼，位置和角度为父级局部坐标。本导出器只处理 setup 中正常继承、无缩放/倾斜的骨骼；如需其他变换，应扩展矩阵换算。附件的中心由 PSD 边界换算，旋转抵消 setup 骨骼角度，因此原始姿势不会散开。PNG 默认有 2 像素透明留边。

双手是 `weapon` 的子骨骼，双臂 IK 以手腕为目标。移动武器即可检查握点；独立枪缨可在武器下面摆动。这里没有生成加权网格、面部表情、换手皮肤或多视角。

## MCP 已验证行为与失败修正

| 现象 | 保留的处理方式 |
| --- | --- |
| Windows 在 MCP STDIO 已开始后首次导入 NumPy 卡在原生 DLL 加载 | 启动器先导入 NumPy、Pillow、psd-tools，再启动 FastMCP |
| 当前会话看不到动态注册的工具 | 标准 Python MCP STDIO 客户端实际连接服务，执行工具发现和调用 |
| JS 异常没有错误消息，调用一直等 echo | 使用受支持的 ES3 风格语法并检查结束标记，单次 180 秒超时后报错，不盲目重试 |
| 多边形相邻处出现叠色/缝隙 | `selection.select(points, SelectionType.REPLACE, 0, false)` 禁用抗锯齿作严格像素分配 |
| `getByName` 找不到图层时脚本中断 | 提前核对配方命名，不用它做试探性存在检查 |
| 相对文档的图层移动被忽略 | 相对另一层用 `PLACEBEFORE` / `PLACEAFTER`，merge 前明确 activeLayer |
| 设置 foreground hex 后填成黑色 | `SolidColor` 显式设置 RGB，再 `selection.fill` |
| MCP `add_gradient` 接受额外字段，但仍画满画布 | 工具 schema 没有局部尺寸字段；本流程直接在 Photopea 内填局部色带 |
| 尝试缩放/平移渐变后补绘消失 | 不把调用成功当作绘制成功；检查新增 alpha，最终使用已验证的局部色带方法 |

只声明这些已测行为，不保证上游全部 42 个工具、所有字体或未来版本都兼容。出现异常先检查 `work/mcp-transcript.json` 和服务日志，定位失败阶段；修正后从合适阶段重放。

## 验证与质量边界

首次任务的初始分层、补绘 PSD 与官方运行库 setup 渲染均保持原图可见像素一致：透明通道变化 0，预乘 RGB 平均误差 0。纯透明像素的 RGB 不作为视觉误差。

官方 `@esotericsoftware/spine-canvas` 4.2.120 在初始姿势、`idle`、`rig_check` 中检查 183 个采样姿势。双臂末端与握点最大误差约 0.000004 像素，无浏览器错误或非有限骨骼变换。数字必须与具体输出目录的报告一起看；PSD 二进制哈希不是验收条件，编辑器元数据或压缩可能改变它。

另有 6 个离线测试覆盖掩码压缩、透明像素比较、骨骼坐标换算和原图哈希拦截：

```powershell
python -m unittest discover -s tests -p test_photopea_workflow.py -v
```

这些测试不代替 `replay.py --stage all` 的真实 MCP 和运行库验证。新兼容启动器也已通过 42 个工具发现与 8 × 8 图像填色导出的实际检查。

导入 Spine 时用 **Import Data** 打开 JSON 并保留相邻 `images/`。也可以用 **Import PSD** 重新绑定；PSD 图层本身不携带 JSON 的精确关节与 IK。参考层保持隐藏并通过 `[ignore]` 忽略。格式资料：[Spine JSON](https://esotericsoftware.com/spine-json-format)、[PSD 导入](https://esotericsoftware.com/spine-import-psd)。

当前验收是解析、官方运行库加载和实际渲染，未包含 Spine 桌面编辑器界面导入。隐藏区域采用局部金属/布料颜色补绘；小幅动作可用，大幅攻击、转身或深蹲仍需针对动作补画，并完善遮挡、披风/腰甲权重。连通性通过也不等于关节纹理自然，必须查看部件总览和动作。

运行库通过锁定 npm 依赖下载，不把 `node_modules` 提交到 Git。离线预览包包含运行库及其原始许可文本，使用者应遵守对应许可；该预览不是 Spine Editor 的替代或授权。
