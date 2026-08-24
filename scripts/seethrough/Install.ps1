[CmdletBinding()]
param(
    [string]$ComfyRoot,
    [string]$VenvRoot,
    [switch]$DownloadModels,
    [switch]$SkipPluginCheckout
)

. (Join-Path $PSScriptRoot "Common.ps1")
$config = Get-SeeThroughConfig
$ComfyRoot = Resolve-ComfyRoot $ComfyRoot
$VenvRoot = Resolve-SeeThroughVenvRoot -ComfyRoot $ComfyRoot -VenvRoot $VenvRoot
$pluginRoot = Join-Path (Join-Path $ComfyRoot "custom_nodes") $config.plugin.directoryName
$constraints = Join-Path $PSScriptRoot "requirements-win-cu126.lock.txt"

# uv's cache normally lives on C:, while this runtime lives on H:. Copy mode is
# intentional here and avoids noisy cross-volume hardlink fallbacks.
$env:UV_LINK_MODE = "copy"

Write-Host "ComfyUI root : $ComfyRoot"
Write-Host "Runtime venv : $VenvRoot"
Write-Host "Plugin root  : $pluginRoot"

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv is required. Install it from https://docs.astral.sh/uv/ and rerun."
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "git is required."
}

Invoke-Checked uv @("python", "install", $config.pythonVersion) "Unable to install Python $($config.pythonVersion)"
if (-not (Test-Path -LiteralPath (Join-Path $VenvRoot "Scripts\python.exe") -PathType Leaf)) {
    Invoke-Checked uv @("venv", "--python", $config.pythonVersion, $VenvRoot) "Unable to create the isolated environment"
}
$python = Get-VenvPython $VenvRoot
$runtimeUserRoot = Join-Path $VenvRoot "user"
$managerConfigRoot = Join-Path $runtimeUserRoot "__manager"
$managerConfigPath = Join-Path $managerConfigRoot "config.ini"
New-Item -ItemType Directory -Force -Path $managerConfigRoot | Out-Null
if (-not (Test-Path -LiteralPath $managerConfigPath -PathType Leaf)) {
    @"
[default]
network_mode = offline
use_uv = true
file_logging = true
"@ | Set-Content -LiteralPath $managerConfigPath -Encoding UTF8
}

$torchArguments = @("pip", "install", "--python", $python)
$torchArguments += @($config.torchPackages)
$torchArguments += @("--index-url", $config.torchIndexUrl)
Invoke-Checked uv $torchArguments "Unable to install CUDA PyTorch"

Invoke-Checked uv @(
    "pip", "install", "--python", $python,
    "-r", (Join-Path $ComfyRoot "requirements.txt"),
    "-c", $constraints
) "Unable to install ComfyUI requirements"

if (-not (Test-Path -LiteralPath $pluginRoot)) {
    Invoke-Checked git @("clone", $config.plugin.repository, $pluginRoot) "Unable to clone ComfyUI-See-through"
}

if (-not $SkipPluginCheckout) {
    $dirty = & git -C $pluginRoot status --porcelain
    if ($LASTEXITCODE -ne 0) { throw "Invalid plugin repository: $pluginRoot" }
    if ($dirty) {
        throw "Plugin repository has local changes. Preserve them before rerunning: $pluginRoot"
    }
    Invoke-Checked git @("-C", $pluginRoot, "fetch", "origin", $config.plugin.commit) "Unable to fetch the pinned plugin revision"
    Invoke-Checked git @("-C", $pluginRoot, "checkout", "--detach", $config.plugin.commit) "Unable to checkout the pinned plugin revision"
}

Invoke-Checked uv @(
    "pip", "install", "--python", $python,
    "-r", (Join-Path $pluginRoot "requirements.txt"),
    "-c", $constraints
) "Unable to install See-through requirements"

Invoke-Checked uv @(
    "pip", "install", "--python", $python,
    "huggingface-hub>=0.34,<2", "psd-tools>=1.10,<2", "requests>=2.32,<3",
    "-c", $constraints
) "Unable to install maintenance dependencies"

$manifest = [ordered]@{
    schemaVersion = 1
    installedAt = [DateTime]::UtcNow.ToString("o")
    comfyRoot = $ComfyRoot
    comfyCommit = Get-GitHead $ComfyRoot
    venvRoot = $VenvRoot
    runtimeUserRoot = $runtimeUserRoot
    managerConfig = $managerConfigPath
    pluginRoot = $pluginRoot
    pluginCommit = Get-GitHead $pluginRoot
    pythonVersion = (& $python -c "import platform; print(platform.python_version())").Trim()
    torch = (& $python -c "import torch; print(torch.__version__)").Trim()
    torchCuda = (& $python -c "import torch; print(torch.version.cuda)").Trim()
    torchIndexUrl = $config.torchIndexUrl
}
$manifestPath = Join-Path $VenvRoot "seethrough-runtime.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "Runtime manifest: $manifestPath"

if ($DownloadModels) {
    & (Join-Path $PSScriptRoot "Download-Models.ps1") -ComfyRoot $ComfyRoot -VenvRoot $VenvRoot
    if ($LASTEXITCODE -ne 0) { throw "Model download failed" }
}

& (Join-Path $PSScriptRoot "Diagnose.ps1") -ComfyRoot $ComfyRoot -VenvRoot $VenvRoot
if ($LASTEXITCODE -ne 0) { throw "Environment diagnosis failed" }

Write-Host "See-through runtime installation completed."
