# 赵云新图：GPU 补绘测试素材

本目录包含站立图及通过 Photopea MCP 准备的测试输入。GPU 结果已归档；完整部件质量尚未通过，也不是完整 Spine PSD。最新问题和计划见 [GPU 复核方案](../../../docs/COMFY_INPAINT_GPU_REVIEW_NEXT.zh-CN.md)。

- [原图](source.png)：1024 × 1024，含实际棋盘格像素，未修改上传文件。
- [素材总览](test-inputs-overview.jpg)：四行分别为披风纹理对照、披风补全、大腿补全、前臂补全；列为输入、编辑蒙版、保留纹理。
- [manifest.json](manifest.json)：原图/素材 SHA256、提示词、seed、裁片坐标和建议 pivot。
- [workflows](workflows)：四份默认 seed 17 的 ComfyUI API 执行图。
- [verification.json](verification.json)：实际检查结果及待验证项。

完整部署、模型下载、运行、MCP 接入和 Spine 验收见 [GPU 测试方案](../../../docs/COMFY_INPAINT_GPU_TEST_PLAN.zh-CN.md)。在已运行 ComfyUI 并安装文档指定模型的环境中，从仓库根目录执行：

```bash
python -m pip install -r scripts/comfy_inpaint/requirements.txt
python scripts/comfy_inpaint/run.py --preflight-only --output output/inpaint-preflight
python scripts/comfy_inpaint/run.py --tasks cape_control --seeds 17 --output output/inpaint-probe
python scripts/comfy_inpaint/run.py --output output/inpaint-matrix
```

`mask.png` 白色编辑、黑色保留，读取 red 通道。`target-alpha.png` 白色表示目标不透明形状。`part-native.png` 应按裁片位置回贴，不能把裁片中心都放到相同位置。

后三组中的隐藏结构及关节重叠轮廓是待验证假设；`cape_control` 的编辑区域有原画可对照。图中没有武器，完整战斗绑定还需要单独武器素材。
