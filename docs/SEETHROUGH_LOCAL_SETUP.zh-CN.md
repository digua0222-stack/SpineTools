# See-through 本地分层环境

这套脚本在现有 ComfyUI 旁边创建独立的 GPU Python 环境，用于本地运行
[See-through](https://github.com/shitagaki-lab/see-through) 的
[ComfyUI 封装](https://github.com/jtydhr88/ComfyUI-See-through)。它不会覆盖 ComfyUI 原有
`venv`，不会提交模型权重，也不会默认使用第三方 Hugging Face 镜像。

## 能力边界

See-through 输出语义 RGBA 图层、位置/深度元数据和 PSD 制作素材。它不输出骨骼、关节、
pivot、IK、mesh 或 Spine 动画。当前赵云流程应把它当作粗分层和遮挡补画建议器：可见区域
仍裁切原视频 RGBA，隐藏区域优先从其他真实视频帧补齐。

## 默认目录

| 内容 | 默认路径 |
|---|---|
| 独立 ComfyUI 用户目录 | `H:\\ComfyUI\\.venv-seethrough\\user` |
| ComfyUI | `H:\ComfyUI` |
| 独立运行环境 | `H:\ComfyUI\.venv-seethrough` |
| 插件 | `H:\ComfyUI\custom_nodes\ComfyUI-See-through` |
| 模型 | `H:\ComfyUI\models\SeeThrough` |

所有脚本都接受 `-ComfyRoot` 和 `-VenvRoot`，因此这些路径可以替换。

## 一次性安装

从 SpineTools 仓库根目录运行：

```powershell
pwsh -File .\scripts\seethrough\Install.ps1 `
  -ComfyRoot H:\ComfyUI `
  -DownloadModels
```

安装脚本会：

1. 通过 `uv` 准备 Python 3.12；
2. 创建 `.venv-seethrough`；
3. 从 PyTorch 官方 `cu126` 索引安装实测版本，并用 lock 清单固定所有 Python 依赖；
4. 安装现有 ComfyUI 依赖；
5. 将 ComfyUI-See-through 固定在 `config.json` 指定的提交；
6. 从官方 Hugging Face 仓库下载固定 revision 的 LayerDiff 和 Marigold；
   同时缓存 LayerDiff 初始化所需的 Juggernaut scheduler 配置，保证离线加载；
7. 写入运行环境和模型清单；
8. 执行诊断。

首次模型下载约十余 GB。下载中断后可重新运行，Hugging Face 客户端会复用已完成文件。

## 诊断

```powershell
pwsh -File .\scripts\seethrough\Diagnose.ps1 `
  -ComfyRoot H:\ComfyUI `
  -RequireModels
```

机器可读报告位于：

```text
H:\ComfyUI\.venv-seethrough\seethrough-diagnose.json
```

## 启动

前台启动，日志直接显示在终端：

```powershell
pwsh -File .\scripts\seethrough\Start.ps1 -ComfyRoot H:\ComfyUI -Offline
```


运行时使用上述独立用户目录，安装脚本将其中的 ComfyUI-Manager 设为 offline，不会刷新
注册表或改写原有 `H:\\ComfyUI\\user`。`-Offline` 还会禁止 Hugging Face 和 Transformers
联网，适合验证模型已经完整落盘。

## 测试

透明PNG必须通过 `JoinImageWithAlpha` 把 `LoadImage` 的MASK重新合成为RGBA；完整参数与对照方法见
[Alpha 入参修复与验证](SEETHROUGH_ALPHA_INPUT.zh-CN.md)。测试脚本默认使用 `-AlphaMode preserve`。

仅测试服务与节点注册，不加载大模型：

```powershell
pwsh -File .\scripts\seethrough\Test-Installation.ps1 -ComfyRoot H:\ComfyUI
```

完整推理 smoke test：

```powershell
pwsh -File .\scripts\seethrough\Test-Installation.ps1 `
  -ComfyRoot H:\ComfyUI `
  -FullInference `
  -InputImage "G:\path\video_frame_053.png" `
  -Resolution 1024 `
  -DepthResolution 720 `
  -Steps 4
```

完整测试默认启用两套模型的 `group_offload`、关闭在线下载和 LaMa 附加下载。它会拒绝在
空闲显存低于 `config.json` 阈值时启动，避免和 Unity、MiniMax 等程序争抢显存。4 steps 只用于
证明链路可运行；制作测试应提高到 30 steps。

插件输出的图层 PNG 和 JSON 位于 `H:\ComfyUI\output`，测试报告位于
`.venv-seethrough\seethrough-smoke.json`。

### RTX 3060 低显存实测

本机在保留 WeTERM、CodeBuddy 和 Codex 的情况下，以约 7.5 GB 空闲显存完成了
`512 / depth 384 / 2 steps / group_offload` 全链路：LayerDiff 产生 24 个原始语义层，
后处理输出 13 个带深度信息的 RGBA 部件；LayerDiff 峰值 PyTorch reserved 约 5.34 GB。
脚本因此对不超过 `512 / 384` 的 pilot 使用 7 GB 门槛，其他分辨率仍使用 9.5 GB 安全门槛。
2 steps 只能验证环境和链路，不能用于评价最终分层质量。

## 维护和升级

- 所有上游提交、模型 revision、Python、PyTorch 精确版本和 CUDA wheel 索引都记录在
  `config.json`；其余 Python 包固定在 `requirements-win-cu126.lock.txt`。
- 升级前先修改 pin，在独立分支运行单元测试、节点测试和一次完整 smoke test。
- 不要在插件目录存在本地修改时强制升级；安装脚本会主动停止。
- 不要删除或替换现有 `H:\ComfyUI\venv`，本项目只使用 `.venv-seethrough`。
- 如果更换显卡驱动或 PyTorch CUDA 版本，更新 `torchIndexUrl` 后新建一个 venv 验证，避免原地
  混装 CPU/GPU wheel。

## 授权提醒

- See-through 上游代码为 Apache-2.0；ComfyUI 插件为 MIT；LayerDiff 完整版权重页标记为
  Apache-2.0。
- Marigold 当前模型页没有明确的 license/model card。内部研究可以独立验证，但商用发布、
  托管服务或重新分发权重前应先向权重发布方取得明确许可。
- 模型权重不进入 SpineTools Git 仓库。输入角色和视频素材的权利需要单独确认。
