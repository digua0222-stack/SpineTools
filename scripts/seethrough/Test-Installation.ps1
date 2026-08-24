[CmdletBinding()]
param(
    [string]$ComfyRoot,
    [string]$VenvRoot,
    [int]$Port = 0,
    [switch]$FullInference,
    [string]$InputImage,
    [int]$Resolution = 1024,
    [int]$DepthResolution = 720,
    [int]$Steps = 4,
    [switch]$IgnoreVramGuard
)

. (Join-Path $PSScriptRoot "Common.ps1")
$config = Get-SeeThroughConfig
$ComfyRoot = Resolve-ComfyRoot $ComfyRoot
$VenvRoot = Resolve-SeeThroughVenvRoot -ComfyRoot $ComfyRoot -VenvRoot $VenvRoot
$python = Get-VenvPython $VenvRoot
if ($Port -le 0) { $Port = [int]$config.defaultPort }
$serverUrl = "http://127.0.0.1:$Port"
$startedPid = $null

if (-not (Test-TcpPort -Port $Port)) {
    $server = & (Join-Path $PSScriptRoot "Start.ps1") -ComfyRoot $ComfyRoot -VenvRoot $VenvRoot -Port $Port -Background -Offline
    $startedPid = $server.pid
    Write-Host "Started ComfyUI PID $startedPid"
    Wait-ComfyServer -ServerUrl $serverUrl -TimeoutSeconds 240
}

try {
    $objectInfo = Invoke-RestMethod -Uri "$serverUrl/object_info" -Method Get -TimeoutSec 60
    $missing = @($config.requiredNodes | Where-Object { -not ($objectInfo.PSObject.Properties.Name -contains $_) })
    if ($missing.Count -gt 0) {
        throw "Missing See-through nodes: $($missing -join ', ')"
    }
    Write-Host "Node smoke test passed: $($config.requiredNodes.Count) required nodes loaded."

    if ($FullInference) {
        if (-not $InputImage) { throw "-InputImage is required with -FullInference." }
        & (Join-Path $PSScriptRoot "Diagnose.ps1") -ComfyRoot $ComfyRoot -VenvRoot $VenvRoot -RequireModels
        if ($LASTEXITCODE -ne 0) { throw "Model diagnosis failed" }

        $freeVram = Get-FreeVramMiB
        $requiredVram = [int]$config.minimumFreeVramMiBForInference
        if ($Resolution -le 512 -and $DepthResolution -le 384) {
            $requiredVram = [int]$config.minimumFreeVramMiBForPilotInference
        }
        if (-not $IgnoreVramGuard -and $null -ne $freeVram -and $freeVram -lt $requiredVram) {
            throw "Only $freeVram MiB VRAM is free; this run requires $requiredVram MiB. Close GPU-heavy apps or pass -IgnoreVramGuard."
        }
        $report = Join-Path $VenvRoot "seethrough-smoke.json"
        Invoke-Checked $python @(
            (Join-Path $PSScriptRoot "smoke_test.py"),
            "--server", $serverUrl,
            "--comfy-root", $ComfyRoot,
            "--input", ([System.IO.Path]::GetFullPath($InputImage)),
            "--resolution", $Resolution,
            "--depth-resolution", $DepthResolution,
            "--steps", $Steps,
            "--report", $report
        ) "Full See-through inference failed"
        Write-Host "Inference smoke report: $report"
    }
} finally {
    if ($null -ne $startedPid) {
        Stop-Process -Id $startedPid -ErrorAction SilentlyContinue
        Write-Host "Stopped temporary ComfyUI PID $startedPid"
    }
}
