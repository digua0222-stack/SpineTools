[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$LayerJson,

    [string]$OutputPath,

    [ValidateRange(1, 8)]
    [int]$Columns = 4,

    [ValidateRange(160, 800)]
    [int]$CellWidth = 320,

    [ValidateRange(160, 800)]
    [int]$CellHeight = 280
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$jsonPath = (Resolve-Path -LiteralPath $LayerJson).Path
$json = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json
$jsonDirectory = Split-Path -Parent $jsonPath

if (-not $OutputPath) {
    $stem = [IO.Path]::GetFileNameWithoutExtension($jsonPath)
    $OutputPath = Join-Path $jsonDirectory "${stem}_contact_sheet.png"
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

Add-Type -AssemblyName System.Drawing

$headerHeight = 76
$margin = 16
$labelHeight = 40
$layerCount = @($json.layers).Count
$rows = [Math]::Ceiling($layerCount / $Columns)
$canvasWidth = ($Columns * $CellWidth) + ($margin * 2)
$canvasHeight = $headerHeight + ($rows * $CellHeight) + $margin

$bitmap = [Drawing.Bitmap]::new($canvasWidth, $canvasHeight)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::Half

$backgroundBrush = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255, 24, 27, 33))
$cellBrush = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255, 174, 178, 188))
$headerBrush = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255, 238, 241, 246))
$labelBrush = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255, 24, 27, 33))
$borderPen = [Drawing.Pen]::new([Drawing.Color]::FromArgb(255, 78, 84, 96), 1)
$titleFont = [Drawing.Font]::new("Microsoft YaHei UI", 14, [Drawing.FontStyle]::Bold)
$metaFont = [Drawing.Font]::new("Microsoft YaHei UI", 9, [Drawing.FontStyle]::Regular)
$labelFont = [Drawing.Font]::new("Microsoft YaHei UI", 10, [Drawing.FontStyle]::Bold)

try {
    $graphics.FillRectangle($backgroundBrush, 0, 0, $canvasWidth, $canvasHeight)
    $graphics.DrawString("See-through RGBA parts review", $titleFont, $headerBrush, $margin, 12)
    $meta = "{0} parts | canvas {1}x{2} | {3}" -f $layerCount, $json.width, $json.height, [IO.Path]::GetFileName($jsonPath)
    $graphics.DrawString($meta, $metaFont, $headerBrush, $margin, 43)

    for ($index = 0; $index -lt $layerCount; $index++) {
        $layer = $json.layers[$index]
        $column = $index % $Columns
        $row = [Math]::Floor($index / $Columns)
        $cellX = $margin + ($column * $CellWidth)
        $cellY = $headerHeight + ($row * $CellHeight)
        $imageX = $cellX + 8
        $imageY = $cellY + 8
        $imageAreaWidth = $CellWidth - 16
        $imageAreaHeight = $CellHeight - $labelHeight - 16

        $graphics.FillRectangle($cellBrush, $cellX, $cellY, $CellWidth - 4, $CellHeight - 4)
        $graphics.DrawRectangle($borderPen, $cellX, $cellY, $CellWidth - 4, $CellHeight - 4)

        $imagePath = Join-Path $jsonDirectory $layer.filename
        if (Test-Path -LiteralPath $imagePath) {
            $image = [Drawing.Image]::FromFile($imagePath)
            try {
                $scale = [Math]::Min($imageAreaWidth / $image.Width, $imageAreaHeight / $image.Height)
                $drawWidth = [Math]::Max(1, [int]($image.Width * $scale))
                $drawHeight = [Math]::Max(1, [int]($image.Height * $scale))
                $drawX = $imageX + [int](($imageAreaWidth - $drawWidth) / 2)
                $drawY = $imageY + [int](($imageAreaHeight - $drawHeight) / 2)
                $graphics.DrawImage($image, $drawX, $drawY, $drawWidth, $drawHeight)
            }
            finally {
                $image.Dispose()
            }
        }

        $partWidth = [int]$layer.right - [int]$layer.left
        $partHeight = [int]$layer.bottom - [int]$layer.top
        $label = "{0}  ({1}x{2})" -f $layer.name, $partWidth, $partHeight
        $graphics.DrawString($label, $labelFont, $labelBrush, $cellX + 8, $cellY + $CellHeight - $labelHeight)
    }

    $bitmap.Save($OutputPath, [Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $titleFont.Dispose()
    $metaFont.Dispose()
    $labelFont.Dispose()
    $backgroundBrush.Dispose()
    $cellBrush.Dispose()
    $headerBrush.Dispose()
    $labelBrush.Dispose()
    $borderPen.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

Write-Output (Resolve-Path -LiteralPath $OutputPath).Path
