[CmdletBinding()]
param(
    [string]$ComfyRoot,
    [string]$VenvRoot,
    [switch]$DownloadModels,
    [string]$HfEndpoint = "",
    [switch]$ForceModels,
    [switch]$SkipPluginCheckout,
    [switch]$SkipPrerequisiteInstall,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")
$config = Get-SeeThroughConfig

if (-not $ComfyRoot) {
    $ComfyRoot = if ($env:COMFYUI_ROOT) { $env:COMFYUI_ROOT } else { Join-Path $HOME "ComfyUI" }
}
$ComfyRoot = [IO.Path]::GetFullPath($ComfyRoot)
if (-not $VenvRoot) { $VenvRoot = Join-Path $ComfyRoot ".venv-seethrough" }
$VenvRoot = [IO.Path]::GetFullPath($VenvRoot)

function Install-WinGetPackage {
    param([Parameter(Mandatory = $true)][string]$Id)
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "Missing prerequisite and winget is unavailable: $Id"
    }
    Invoke-Checked $winget.Source @(
        "install", "--id", $Id, "--exact", "--silent",
        "--accept-package-agreements", "--accept-source-agreements"
    ) "Unable to install prerequisite $Id"
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$env:Path;$machinePath;$userPath"
}

if ($DryRun) {
    $uvCommand = Get-Command uv -ErrorAction SilentlyContinue
    $uvPath = if ($uvCommand) { $uvCommand.Source } else { "uv" }
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    $bootstrapPython = if ($pythonCommand) { $pythonCommand.Source } else { "python" }
} else {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        if ($SkipPrerequisiteInstall) { throw "git is required." }
        Install-WinGetPackage -Id "Git.Git"
    }
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        if ($SkipPrerequisiteInstall) { throw "uv is required." }
        Install-WinGetPackage -Id "astral-sh.uv"
    }

    $uv = Get-Command uv -ErrorAction SilentlyContinue
    if (-not $uv) {
        $uvCandidates = @(
            (Join-Path $HOME ".local\bin\uv.exe"),
            (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\uv.exe")
        )
        $uvPath = $uvCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
        if (-not $uvPath) { throw "uv was installed but is not visible in this shell. Open a new terminal and rerun." }
    } else {
        $uvPath = $uv.Source
    }
    Invoke-Checked $uvPath @("python", "install", $config.pythonVersion) "Unable to install Python $($config.pythonVersion)"
    $bootstrapPython = (& $uvPath python find $config.pythonVersion).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $bootstrapPython) { throw "Unable to locate Python $($config.pythonVersion)" }
}

$arguments = @(
    (Join-Path $PSScriptRoot "install_runtime.py"),
    "--platform", "windows",
    "--comfy-root", $ComfyRoot,
    "--venv-root", $VenvRoot,
    "--uv-bin", $uvPath
)
if ($DownloadModels) { $arguments += "--download-models" }
if ($HfEndpoint) { $arguments += @("--hf-endpoint", $HfEndpoint) }
if ($ForceModels) { $arguments += "--force-models" }
if ($SkipPluginCheckout) { $arguments += "--skip-plugin-checkout" }
if ($DryRun) { $arguments += "--dry-run" }

Invoke-Checked $bootstrapPython $arguments "See-through toolchain installation failed"
