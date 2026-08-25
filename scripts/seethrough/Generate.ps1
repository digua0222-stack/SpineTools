[CmdletBinding()]
param(
    [string]$ComfyRoot,
    [string]$VenvRoot,

    [Parameter(Mandatory = $true)]
    [string]$InputImage,

    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory,

    [string]$OutputPrefix = "seethrough",
    [string]$OutputArchive = "",
    [ValidateRange(512, 2048)][int]$Resolution = 1024,
    [ValidateRange(-1, 2048)][int]$DepthResolution = 720,
    [ValidateRange(1, 100)][int]$Steps = 30,
    [ValidateRange(0, 4294967295)][long]$Seed = 42,
    [ValidateSet("preserve", "opaque")][string]$AlphaMode = "preserve",
    [ValidateSet("none", "nf4")][string]$QuantMode = "none",
    [ValidateSet("auto", "on", "off")][string]$GroupOffload = "auto",
    [bool]$TblrSplit = $true,
    [bool]$UseLama = $false,
    [ValidateRange(60, 86400)][int]$InferenceTimeout = 3600,
    [ValidateRange(1, 65535)][int]$Port = 8188,
    [switch]$IgnoreVramGuard,
    [switch]$KeepServer,
    [switch]$SkipDiagnose,
    [bool]$Offline = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

$ComfyRoot = Resolve-ComfyRoot $ComfyRoot
$VenvRoot = Resolve-SeeThroughVenvRoot -ComfyRoot $ComfyRoot -VenvRoot $VenvRoot
$python = Get-VenvPython $VenvRoot

$arguments = @(
    (Join-Path $PSScriptRoot "generate.py"),
    "--comfy-root", $ComfyRoot,
    "--venv-root", $VenvRoot,
    "--input", ([IO.Path]::GetFullPath($InputImage)),
    "--output-dir", ([IO.Path]::GetFullPath($OutputDirectory)),
    "--output-prefix", $OutputPrefix,
    "--resolution", $Resolution,
    "--depth-resolution", $DepthResolution,
    "--steps", $Steps,
    "--seed", $Seed,
    "--alpha-mode", $AlphaMode,
    "--quant-mode", $QuantMode,
    "--group-offload", $GroupOffload,
    $(if ($TblrSplit) { "--tblr-split" } else { "--no-tblr-split" }),
    $(if ($UseLama) { "--use-lama" } else { "--no-use-lama" }),
    "--inference-timeout", $InferenceTimeout,
    "--port", $Port,
    $(if ($Offline) { "--offline" } else { "--no-offline" })
)
if ($IgnoreVramGuard) { $arguments += "--ignore-vram-guard" }
if ($KeepServer) { $arguments += "--keep-server" }
if ($SkipDiagnose) { $arguments += "--skip-diagnose" }
if ($OutputArchive) { $arguments += @("--archive", ([IO.Path]::GetFullPath($OutputArchive))) }

Invoke-Checked $python $arguments "See-through generation failed"
