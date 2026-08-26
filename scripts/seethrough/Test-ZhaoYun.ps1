[CmdletBinding()]
param(
    [string]$ComfyRoot,
    [string]$VenvRoot,
    [string]$InputImage,
    [string]$OutputDirectory,
    [string]$OutputArchive = "",
    [ValidateSet("pilot", "screen", "quality")][string]$Preset = "pilot",
    [ValidateScript({ $_ -eq 0 -or ($_ -ge 512 -and $_ -le 2048) })][int]$Resolution = 0,
    [ValidateScript({ $_ -eq -2 -or $_ -eq -1 -or ($_ -ge 64 -and $_ -le 2048) })][int]$DepthResolution = -2,
    [ValidateScript({ $_ -eq 0 -or ($_ -ge 1 -and $_ -le 100) })][int]$Steps = 0,
    [ValidateRange(0, 4294967295)][long]$Seed = 42,
    [ValidateSet("preserve", "opaque")][string]$AlphaMode = "preserve",
    [ValidateSet("none", "nf4")][string]$QuantMode = "none",
    [ValidateSet("auto", "on", "off")][string]$GroupOffload = "auto",
    [bool]$TblrSplit = $true,
    [bool]$UseLama = $false,
    [string]$HfEndpoint = "",
    [switch]$ForceModels,
    [switch]$SkipInstall,
    [switch]$SkipPluginCheckout,
    [switch]$SkipPrerequisiteInstall,
    [switch]$IgnoreVramGuard,
    [ValidateRange(60, 86400)][int]$InferenceTimeout = 7200,
    [ValidateRange(1, 65535)][int]$Port = 8188,
    [bool]$Offline = $true,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
if (-not $InputImage) {
    $InputImage = Join-Path $repoRoot "examples\seethrough\zhaoyun.png"
}
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $repoRoot "output\zhaoyun-seethrough"
}
$InputImage = [IO.Path]::GetFullPath($InputImage)
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)

$presets = @{
    pilot   = @{ Resolution = 512;  DepthResolution = 384; Steps = 4 }
    screen  = @{ Resolution = 768;  DepthResolution = 512; Steps = 30 }
    quality = @{ Resolution = 1024; DepthResolution = 720; Steps = 50 }
}
$selected = $presets[$Preset]
if ($Resolution -eq 0) { $Resolution = [int]$selected.Resolution }
if ($DepthResolution -eq -2) { $DepthResolution = [int]$selected.DepthResolution }
if ($Steps -eq 0) { $Steps = [int]$selected.Steps }

if (-not (Test-Path -LiteralPath $InputImage -PathType Leaf)) {
    throw "Zhao Yun test image is missing: $InputImage"
}

Write-Host "Zhao Yun See-through test"
Write-Host "  preset:          $Preset"
Write-Host "  input:           $InputImage"
Write-Host "  output:          $OutputDirectory"
Write-Host "  resolution:      $Resolution"
Write-Host "  depth resolution:$DepthResolution"
Write-Host "  steps / seed:    $Steps / $Seed"
Write-Host "  alpha / quant:   $AlphaMode / $QuantMode"

if (-not $SkipInstall) {
    $installParameters = @{
        ComfyRoot = $ComfyRoot
        VenvRoot = $VenvRoot
        DownloadModels = $true
        HfEndpoint = $HfEndpoint
        ForceModels = $ForceModels
        SkipPluginCheckout = $SkipPluginCheckout
        SkipPrerequisiteInstall = $SkipPrerequisiteInstall
        DryRun = $DryRun
    }
    & (Join-Path $PSScriptRoot "Install.ps1") @installParameters
}

if ($DryRun) {
    Write-Host "[dry-run] Installation/download and generation plan validated; inference was not started."
    return
}

$resolvedComfyRoot = Resolve-ComfyRoot $ComfyRoot
$resolvedVenvRoot = Resolve-SeeThroughVenvRoot -ComfyRoot $resolvedComfyRoot -VenvRoot $VenvRoot

$generateParameters = @{
    ComfyRoot = $resolvedComfyRoot
    VenvRoot = $resolvedVenvRoot
    InputImage = $InputImage
    OutputDirectory = $OutputDirectory
    OutputPrefix = "zhaoyun_${Preset}_seed_${Seed}"
    OutputArchive = $OutputArchive
    Resolution = $Resolution
    DepthResolution = $DepthResolution
    Steps = $Steps
    Seed = $Seed
    AlphaMode = $AlphaMode
    QuantMode = $QuantMode
    GroupOffload = $GroupOffload
    TblrSplit = $TblrSplit
    UseLama = $UseLama
    InferenceTimeout = $InferenceTimeout
    Port = $Port
    IgnoreVramGuard = $IgnoreVramGuard
    Offline = $Offline
}
& (Join-Path $PSScriptRoot "Generate.ps1") @generateParameters

$reportPath = Join-Path $OutputDirectory "run_report.json"
if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
    throw "Generation completed without run_report.json: $reportPath"
}
$report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
$layerJson = [string]$report.layerInfo
if (-not (Test-Path -LiteralPath $layerJson -PathType Leaf)) {
    throw "Layer metadata referenced by run_report.json is missing: $layerJson"
}

$contactSheet = Join-Path $OutputDirectory "contact_sheet.png"
& (Join-Path $PSScriptRoot "New-LayerContactSheet.ps1") `
    -LayerJson $layerJson `
    -OutputPath $contactSheet

$python = Get-VenvPython $resolvedVenvRoot
$reconstructionDirectory = Join-Path $OutputDirectory "reconstruction"
Invoke-Checked $python @(
    (Join-Path $PSScriptRoot "reconstruct_layers.py"),
    "--layer-json", $layerJson,
    "--source", $InputImage,
    "--output-dir", $reconstructionDirectory,
    "--title", "Zhao Yun See-through $Preset seed $Seed"
) "Zhao Yun reconstruction review failed"

Write-Host "Zhao Yun test completed."
Write-Host "  layers:          $($report.layerCount)"
Write-Host "  run report:      $reportPath"
Write-Host "  contact sheet:   $contactSheet"
Write-Host "  comparison:      $(Join-Path $reconstructionDirectory 'comparison.png')"
Write-Host "  metrics:         $(Join-Path $reconstructionDirectory 'metrics.json')"
