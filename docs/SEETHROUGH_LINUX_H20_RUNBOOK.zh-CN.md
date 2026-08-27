# See-through Linux/H20 实测复盘与复跑手册

本文记录 2026-08-27 在临时 Linux GPU 实例上的真实安装与推理结果，并给出新实例的一键复跑、归档和提速方案。文中不记录任何密码、令牌或私钥。

## 结论

See-through 可以在 Linux + NVIDIA H20 上离线运行。实测已完成从赵云原图到 RGBA 部件、深度图和 `layers.json` 的端到端导出。

实测环境：

| 项目 | 实测值 |
|---|---|
| OS | TencentOS Server 3.2，x86_64 |
| CPU / RAM | 384 逻辑核 / 2.2 TiB |
| GPU | NVIDIA H20，97,871 MiB |
| 驱动 | 535.247.01，`nvidia-smi` 报 CUDA 12.2 |
| Python | 3.12.14，由 uv 安装 |
| PyTorch | 2.5.1+cu121 |
| ComfyUI | `f350acdf213a1b3cbeab2059888265b21590ce9f` |
| See-through | `98d754bf04f668647919ab750eccb0e0640faa81` |

实测结果：

| 档位 | 参数 | 结果 | 端到端时间 |
|---|---|---|---|
| probe | 512 / depth 384 / 1 step | 成功，27 层 | 约 27 秒 |
| balanced | 1024 / depth 720 / 30 steps | 成功，22 层 | 约 1 分 55 秒 |
| max | 2048 / depth 2048 / 100 steps | 主体扩散完成，整轮未完成；实例回收前已运行超过 15 分钟 | 未完成 |

`max` 运行时 GPU 利用率 100%，显存约 22 GiB，功耗约 343 W。瓶颈是计算量而不是显存。1024 档比 512 档层数更少也再次证明：提高分辨率和步数不会单调改善语义拆分完整度。

临时实例在最高配任务结束前停止接受 SSH，因此服务器上的成功产物没有来得及拉回 PC。复跑时应在每个成功档位结束后立即归档和下载，不要等最高配一起打包。

## 新环境最快复跑

要求：Linux x86_64、NVIDIA CUDA GPU、root 或 sudo、至少约 20 GiB 可用磁盘。模型本体约 12.5 GiB。

```bash
git clone https://github.com/digua0222-stack/SpineTools.git /opt/SpineTools
cd /opt/SpineTools

./scripts/seethrough/install-linux.sh \
  --comfy-root /opt/seethrough/ComfyUI \
  --venv-root /opt/seethrough/venv \
  --download-models
```

安装器会完成：

1. 安装 `git`、`curl`、`libGL.so.1` 和 glib2。
2. 安装 uv 与 Python 3.12。
3. 克隆并锁定 ComfyUI 和 See-through 提交。
4. 安装与 535 驱动兼容的 PyTorch cu121 依赖。
5. 应用 Linux/H20 文本编码器 FP32 兼容补丁。
6. 下载锁定的 LayerDiff、Marigold 和 scheduler 文件。
7. 生成运行时清单并执行环境诊断。

先跑 1-step 链路探针，并立即生成 tar：

```bash
./scripts/seethrough/test-zhaoyun.sh \
  --preset probe \
  --comfy-root /opt/seethrough/ComfyUI \
  --venv-root /opt/seethrough/venv \
  --skip-install \
  --output-dir /opt/seethrough/output/zhaoyun-probe \
  --tar /opt/seethrough/zhaoyun-probe.tar.gz
```

探针成功后跑实用终稿档：

```bash
./scripts/seethrough/test-zhaoyun.sh \
  --preset balanced \
  --comfy-root /opt/seethrough/ComfyUI \
  --venv-root /opt/seethrough/venv \
  --skip-install \
  --output-dir /opt/seethrough/output/zhaoyun-balanced \
  --tar /opt/seethrough/zhaoyun-balanced.tar.gz
```

从 Windows PC 拉回：

```powershell
New-Item -ItemType Directory -Force H:\spine_research\SpineTools\artifacts\remote-h20
scp -P <SSH端口> root@<服务器IP>:/opt/seethrough/zhaoyun-balanced.tar.gz `
  H:\spine_research\SpineTools\artifacts\remote-h20\
```

输入密码时只在 `scp` 交互提示中输入，不要把密码写入脚本、命令参数、环境变量或文档。

## 最高配压力测试

工具允许的上限是 2048 / depth 2048 / 100 steps：

```bash
./scripts/seethrough/test-zhaoyun.sh \
  --preset max \
  --comfy-root /opt/seethrough/ComfyUI \
  --venv-root /opt/seethrough/venv \
  --skip-install \
  --output-dir /opt/seethrough/output/zhaoyun-max \
  --tar /opt/seethrough/zhaoyun-max.tar.gz
```

这是压力测试，不是日常质量档。扩散主计算可粗略看作与 `steps × resolution²` 成正比；相对 1024/30，2048/100 的理论计算量约为：

```text
(2048 / 1024)² × (100 / 30) ≈ 13.3 倍
```

而且 `depth-resolution=2048` 还会增加每个部件的 Marigold 深度成本。实际业务不应为每个 Seed 使用此档。

## 本次遇到的问题与修复

### SSH 端口不是 22

22 端口被网络网关拦截并返回 502，正确端口是实例提供的 36000。新环境先用只读认证探测，确认主机指纹后再输入临时密码：

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -p <端口> root@<IP> true
```

### 系统 Python 只有 3.9

没有升级或覆盖系统 Python。使用 uv 安装独立 Python 3.12，并将运行时放在 `/opt/seethrough/venv`。

### 驱动 535 不能直接使用仓库 Windows cu126 锁

`nvidia-smi` 的 CUDA 版本表示驱动上限，不代表已安装 CUDA Toolkit。驱动 535 与 cu126 组合风险高，因此 Linux 配置固定为 PyTorch 2.5.1+cu121。H20 的计算能力 9.0 在该组合下已完成 FP16/BF16/FP32 基础计算测试。

### OpenCV 导入失败：`libGL.so.1` 缺失

See-through 节点首次加载时报：

```text
ImportError: libGL.so.1: cannot open shared object file
```

TencentOS/RHEL 系使用 `mesa-libGL glib2`；Debian/Ubuntu 使用 `libgl1 libglib2.0-0`。`install-linux.sh` 已自动处理。

### ComfyUI 用户目录和 Hub 缓存路径不一致

生成器固定使用 `<venv>/user` 和 `<venv>/hf-hub-cache`。手工安装时若把模型 scheduler 缓存放在相邻目录，环境复检会报告 scheduler 缺失。安装器现在会创建 `<venv>/user/default`，并始终把辅助 Hub 文件放入 `<venv>/hf-hub-cache`。

### H20 上 BF16 CLIP 导致 `Floating-point exception`

Marigold 加载成功后，在空文本编码器的 BF16 `Linear.forward` 中稳定触发 `SIGFPE`，退出码 136。同模型改为 FP32 后正常；简单的独立 BF16 矩阵运算也正常，因此问题集中在当前驱动/PyTorch/CLIP BF16 内核组合。

Linux 安装器会对锁定插件提交应用 `patches/linux-h20-fp32-text-encoder.patch`：只让一次性文本编码器使用 FP32，生成缓存后立即卸载；UNet 和 VAE 仍为 BF16。H20 96GB 上该修复的显存代价可以忽略。

### ComfyUI 数据库警告

日志曾出现 `sqlite3.OperationalError: unable to open database file`，但 API、节点注册和推理均可继续。新安装器会提前创建隔离用户目录。若警告仍在，应检查目录权限和显式 `--database-url`，但不要把它误判为本次推理失败原因。

### 临时实例回收

最高配运行期间两个 SSH 会话同时被远端关闭，随后端口在 TCP 建连后立即关闭，符合实例回收/容器停止的表现。以后应：

1. 先记录实例回收时间。
2. probe 成功即 tar + scp。
3. balanced 成功再次 tar + scp。
4. 只有剩余租期充足时才运行 max。
5. 长任务使用平台作业系统、tmux 或 systemd-run；SSH 断开不应杀死推理进程。

## 提速策略

优先级从高到低：

1. **分级跑测**：probe 验证链路，screen 做多 Seed，balanced 只跑入选 Seed。不要直接 max。
2. **降低 Steps**：Seed 初筛用 4–20 步，终稿通常 30–50 步；100 步不保证边界或漏件改善。
3. **控制主分辨率**：紧裁人物后用 768/1024，通常比带大量透明边或长枪一起上 2048 更有效。
4. **深度分辨率独立控制**：RGBA 边界问题不要靠提高 depth；720 已足够验证多数层级。
5. **关闭卸载和量化**：96GB H20 使用 `quant=none`、`group-offload=off`，避免 CPU/GPU 搬运和 NF4 解量化开销。
6. **限制 CPU 线程**：Linux wrapper 默认把 OpenMP/MKL/OpenBLAS/NumExpr 设为 8，避免 384 核容器的线程启动和争用成本；可按机器基准覆盖。
7. **保持 ComfyUI 常驻**：多 Seed 时复用同一服务和节点缓存，避免每轮重复导入插件与加载模型。`generate.py --keep-server` 可保留由首轮启动的服务。
8. **升级驱动后再升级 Torch**：驱动 535 迫使本次使用旧 cu121 栈，并触发 ComfyUI 的 PyTorch <2.8 降级警告。新机器若能升级驱动，应重新验证仓库默认新 Torch 锁、动态 VRAM 和 BF16 路径。

推荐实际生产流水线：

| 阶段 | 参数 | Seed 数 | 目的 |
|---|---|---:|---|
| 连通性 | 512 / 384 / 1 | 1 | 验证安装、节点、模型、导出 |
| 快筛 | 512–768 / 384–512 / 4–20 | 4 | 排除漏件和明显错分 |
| 复筛 | 768 / 512 / 20–30 | 2 | 比较语义、Alpha 和重组 |
| 终稿 | 1024 / 720 / 30–50 | 1–2 | 输出候选部件 |
| 压测 | 2048 / 2048 / 100 | 0–1 | 只做性能/上限验证 |

## 后续代码优化空间

当前工作流仍会在每个 Seed 上重复深度估计。进一步优化建议按以下顺序实现：

1. 增加 `layer-only` 初筛模式：先只运行 LayerDiff，选中 Seed 后再运行 Marigold。
2. 增加单进程多 Seed 队列：一次启动 ComfyUI，顺序提交多个 Seed，并自动生成联系表和评分清单。
3. 将 LayerDiff 和深度阶段分别计时，写入 `run_report.json`，用数据决定优化方向。
4. 对 H20 新驱动栈基准测试 PyTorch 2.8+、SDPA/Flash Attention 和 TF32；通过像素/Alpha 回归后再默认启用。
5. 在临时算力上增加“每轮成功立即归档并下载”的远程 runner，避免实例回收造成产物丢失。

## 验收清单

```bash
nvidia-smi
/opt/seethrough/venv/bin/python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"

/opt/seethrough/venv/bin/python /opt/SpineTools/scripts/seethrough/verify_environment.py \
  --config /opt/SpineTools/scripts/seethrough/config.json \
  --comfy-root /opt/seethrough/ComfyUI \
  --plugin-root /opt/seethrough/ComfyUI/custom_nodes/ComfyUI-See-through \
  --hub-cache /opt/seethrough/venv/hf-hub-cache \
  --json-out /opt/seethrough/environment.json \
  --require-models
```

通过标准：`ok=true`、CUDA 可用、6 个必需节点全部注册、两套模型和 scheduler 均为 `ready=true`，probe 生成 `run_report.json` 且 `layerCount > 0`。
