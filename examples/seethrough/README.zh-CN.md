# 赵云 See-through 测试输入

`zhaoyun.png`是本仓库本地See-through工具链的标准测试图片：

- 格式：498×345 RGBA PNG。
- SHA-256：`EDBE1D7CE6483988A10737CD70FC3DBB03A18ECEFC087207A6979A0E86C89D48`。
- 用途：验证透明Alpha输入、人物/长武器语义分层、深度图、指定目录导出及重组差异分析。

该图片由项目维护者提供并随仓库用于工具链测试。仓库不对该角色图片授予独立的商用、素材再销售或商标权利；将图片用于本仓库测试之外的场景时，应由使用者另行确认所需权利。

Windows一键测试：

```powershell
pwsh -NoProfile -File .\scripts\seethrough\Test-ZhaoYun.ps1
```

macOS一键测试：

```bash
./scripts/seethrough/test-zhaoyun.sh
```

两个入口默认使用低成本`pilot`预设，并在首次运行时安装固定版本的ComfyUI、See-through和模型。参数及质量预设见[完整工具链文档](../../docs/SEETHROUGH_TOOLCHAIN.zh-CN.md)。
