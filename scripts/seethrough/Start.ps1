[CmdletBinding()]
param(
    [string]$ComfyRoot,
    [string]$VenvRoot,
    [string]$Listen = "127.0.0.1",
    [int]$Port = 0,
    [switch]$Background,
    [switch]$Offline
)

. (Join-Path $PSScriptRoot "Common.ps1")
$config = Get-SeeThroughConfig
$ComfyRoot = Resolve-ComfyRoot $ComfyRoot
$VenvRoot = Resolve-SeeThroughVenvRoot -ComfyRoot $ComfyRoot -VenvRoot $VenvRoot
$python = Get-VenvPython $VenvRoot
$runtimeUserRoot = Join-Path $VenvRoot "user"
New-Item -ItemType Directory -Force -Path $runtimeUserRoot | Out-Null
if ($Port -le 0) { $Port = [int]$config.defaultPort }
if (Test-TcpPort -Port $Port) { throw "Port $Port is already in use." }

$env:PYTORCH_CUDA_ALLOC_CONF = "expandable_segments:True"
if ($Offline) {
    $env:HF_HUB_OFFLINE = "1"
    $env:TRANSFORMERS_OFFLINE = "1"
}
$arguments = @(
    (Join-Path $ComfyRoot "main.py"),
    "--listen", $Listen,
    "--port", $Port,
    "--user-directory", $runtimeUserRoot,
    "--disable-auto-launch"
)

if ($Background) {
    $logRoot = Join-Path $VenvRoot "logs"
    New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $stdout = Join-Path $logRoot "comfyui-$stamp.out.log"
    $stderr = Join-Path $logRoot "comfyui-$stamp.err.log"
    $process = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $ComfyRoot `
        -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    [pscustomobject]@{ pid = $process.Id; url = "http://${Listen}:$Port"; stdout = $stdout; stderr = $stderr }
    return
}

Push-Location $ComfyRoot
try {
    Invoke-Checked $python $arguments "ComfyUI exited with an error"
} finally {
    Pop-Location
}
