[CmdletBinding()]
param(
    [string]$ComfyRoot,
    [string]$VenvRoot,
    [string]$JsonOut = "",
    [int]$GpuIndex = -1,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$candidates = @()
if ($VenvRoot) { $candidates += (Join-Path $VenvRoot "Scripts\python.exe") }
if ($ComfyRoot) { $candidates += (Join-Path $ComfyRoot ".venv-seethrough\Scripts\python.exe") }
if ($env:COMFYUI_ROOT) { $candidates += (Join-Path $env:COMFYUI_ROOT ".venv-seethrough\Scripts\python.exe") }
$candidates += (Join-Path $HOME "ComfyUI\.venv-seethrough\Scripts\python.exe")
$python = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1

$prefix = @()
if (-not $python) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        $python = $pythonCommand.Source
    } else {
        $pyCommand = Get-Command py -ErrorAction SilentlyContinue
        if ($pyCommand) {
            $python = $pyCommand.Source
            $prefix = @("-3")
        } else {
            throw "Python 3 was not found. Run Install.ps1 first or provide -VenvRoot."
        }
    }
}

$arguments = @(
    $prefix
    (Join-Path $PSScriptRoot "hardware_recommendation.py")
    "--platform", "windows"
    "--format", $(if ($Json) { "json" } else { "text" })
)
if ($JsonOut) { $arguments += @("--json-out", ([IO.Path]::GetFullPath($JsonOut))) }
if ($GpuIndex -ge 0) { $arguments += @("--gpu-index", $GpuIndex) }

& $python @arguments
if ($LASTEXITCODE -ne 0) { throw "Hardware recommendation failed (exit $LASTEXITCODE)" }
