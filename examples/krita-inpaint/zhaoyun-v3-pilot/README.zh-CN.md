# Krita AI 赵云 v3 试验交接包

状态：planned，尚未生成新版输入、KRA、API 执行图或 GPU 候选。本目录用于交接方案，不是可以直接传给现有 v2 运行器的配置。

- [完整实施方案](../../../docs/KRITA_AI_GPU_TEST_PLAN.zh-CN.md)：阶段、输入契约、固定参数、验收及回传要求。
- [experiment.json](experiment.json)：源图身份、三案例提示词、两组设置、18 个任务和停止条件。
- [environment.lock.json](environment.lock.json)：上游固定提交、模型下载位置和预期 SHA256；实际 GPU 兼容性待验证。
- [report.template.json](report.template.json)：复制为每次运行报告，逐阶段记录；未执行项保持 null/not_run。
- [原图与历史素材](../../comfy-inpaint/zhaoyun-v2/README.zh-CN.md)：原图可复用，旧补全蒙版与粗抠轮廓必须经 K0 修正。

从 K0 准备输入开始，然后 K1 验证 A/B 两个探针，再完成 18 张矩阵。现有 `scripts/comfy_inpaint/run.py` 不读取本目录的 JSON，不能仅更换模型后冒充本轮 Krita 流程。K3 适配完成前，可以在 Krita 逐个执行 experiment.json 中的任务。

environment.lock.json 的 models 是 v1.53.0 SDXL 工作负载资源子集加本轮 checkpoint/ControlNet。`installation_dependency_only` 表示可安装以满足插件资源检查，但本轮图中不启用；哈希来自上游清单或模型页，不表示本机已下载。模型文件不随 Git 提交。

所有 JSON 中的源码/素材路径均以仓库根目录为基准；模型安装路径以 ComfyUI 根目录为基准。计划中的 prepared 输入路径是 K0 的交付位置，当前不存在；在 K0 完成并写入哈希前不得标记 inputsReady=true。
