[CmdletBinding()]
param(
    [string]$ComfyRoot,
    [string]$VenvRoot,
    [string]$HfEndpoint = "",
    [switch]$Force
)

. (Join-Path $PSScriptRoot "Common.ps1")
$ComfyRoot = Resolve-ComfyRoot $ComfyRoot
$VenvRoot = Resolve-SeeThroughVenvRoot -ComfyRoot $ComfyRoot -VenvRoot $VenvRoot
$python = Get-VenvPython $VenvRoot
$modelRoot = Join-Path (Join-Path $ComfyRoot "models") "SeeThrough"
$hubCache = Join-Path $VenvRoot "hf-hub-cache"
$arguments = @(
    (Join-Path $PSScriptRoot "download_models.py"),
    "--config", (Join-Path $PSScriptRoot "config.json"),
    "--model-root", $modelRoot,
    "--hub-cache", $hubCache
)
if ($HfEndpoint) { $arguments += @("--endpoint", $HfEndpoint) }
if ($Force) { $arguments += "--force" }

Invoke-Checked $python $arguments "Unable to download See-through models"
