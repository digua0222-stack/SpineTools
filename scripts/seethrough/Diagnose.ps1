[CmdletBinding()]
param(
    [string]$ComfyRoot,
    [string]$VenvRoot,
    [switch]$RequireModels
)

. (Join-Path $PSScriptRoot "Common.ps1")
$config = Get-SeeThroughConfig
$ComfyRoot = Resolve-ComfyRoot $ComfyRoot
$VenvRoot = Resolve-SeeThroughVenvRoot -ComfyRoot $ComfyRoot -VenvRoot $VenvRoot
$python = Get-VenvPython $VenvRoot
$pluginRoot = Join-Path (Join-Path $ComfyRoot "custom_nodes") $config.plugin.directoryName
$reportPath = Join-Path $VenvRoot "seethrough-diagnose.json"
$arguments = @(
    (Join-Path $PSScriptRoot "verify_environment.py"),
    "--config", (Join-Path $PSScriptRoot "config.json"),
    "--comfy-root", $ComfyRoot,
    "--plugin-root", $pluginRoot,
    "--json-out", $reportPath
)
if ($RequireModels) { $arguments += "--require-models" }
Invoke-Checked $python $arguments "See-through diagnosis failed"
Write-Host "Diagnosis report: $reportPath"
