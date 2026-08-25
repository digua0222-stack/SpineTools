Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-SeeThroughConfig {
    $configPath = Join-Path $PSScriptRoot "config.json"
    if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
        throw "See-through config not found: $configPath"
    }
    Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Resolve-ComfyRoot {
    param([string]$ComfyRoot)

    $candidates = @()
    if ($ComfyRoot) { $candidates += $ComfyRoot }
    if ($env:COMFYUI_ROOT) { $candidates += $env:COMFYUI_ROOT }
    $candidates += (Join-Path $HOME "ComfyUI")
    $candidates += "H:\ComfyUI"

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath (Join-Path $candidate "main.py") -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    throw "ComfyUI root was not found. Pass -ComfyRoot or set COMFYUI_ROOT."
}

function Resolve-SeeThroughVenvRoot {
    param(
        [Parameter(Mandatory = $true)][string]$ComfyRoot,
        [string]$VenvRoot
    )
    if ($VenvRoot) {
        return [System.IO.Path]::GetFullPath($VenvRoot)
    }
    Join-Path $ComfyRoot ".venv-seethrough"
}

function Get-VenvPython {
    param([Parameter(Mandatory = $true)][string]$VenvRoot)
    $pythonRelative = if ([IO.Path]::DirectorySeparatorChar -eq '\') { "Scripts\python.exe" } else { "bin/python" }
    $python = Join-Path $VenvRoot $pythonRelative
    if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
        throw "See-through Python environment is missing: $python"
    }
    $python
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$FailureMessage = "Command failed"
    )
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage (exit $LASTEXITCODE): $FilePath $($ArgumentList -join ' ')"
    }
}

function Get-GitHead {
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)
    if (-not (Test-Path -LiteralPath (Join-Path $RepositoryRoot ".git"))) {
        return $null
    }
    $head = & git -C $RepositoryRoot rev-parse HEAD 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    $head.Trim()
}

function Test-TcpPort {
    param(
        [string]$HostName = "127.0.0.1",
        [int]$Port
    )
    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        $task = $client.ConnectAsync($HostName, $Port)
        if (-not $task.Wait(500)) {
            $client.Dispose()
            return $false
        }
        $connected = $client.Connected
        $client.Dispose()
        return $connected
    } catch {
        return $false
    }
}

function Get-FreeVramMiB {
    $nvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
    if (-not $nvidiaSmi) { return $null }
    $raw = & $nvidiaSmi.Source --query-gpu=memory.free --format=csv,noheader,nounits 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) { return $null }
    [int](($raw | Select-Object -First 1).Trim())
}

function Wait-ComfyServer {
    param(
        [string]$ServerUrl,
        [int]$TimeoutSeconds = 180
    )
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            Invoke-RestMethod -Uri "$ServerUrl/system_stats" -Method Get -TimeoutSec 5 | Out-Null
            return
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    throw "ComfyUI did not become ready within $TimeoutSeconds seconds: $ServerUrl"
}
