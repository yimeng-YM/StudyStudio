[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot 'public\logos.png'
$resRoot = Join-Path $projectRoot 'android\app\src\main\res'

if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "StudyStudio logo not found: $sourcePath"
}

function Save-BrandedPng {
    param(
        [Parameter(Mandatory)] [int] $Width,
        [Parameter(Mandatory)] [int] $Height,
        [Parameter(Mandatory)] [double] $LogoScale,
        [Parameter(Mandatory)] [string] $Destination,
        [Parameter(Mandatory)] [bool] $Transparent
    )

    $canvas = New-Object System.Drawing.Bitmap $Width, $Height
    $canvas.SetResolution(96, 96)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear($(if ($Transparent) { [System.Drawing.Color]::Transparent } else { [System.Drawing.Color]::FromArgb(250, 250, 250) }))

    $source = [System.Drawing.Image]::FromFile($sourcePath)
    try {
        $targetSize = [int]([Math]::Round([Math]::Min($Width, $Height) * $LogoScale))
        $left = [int](($Width - $targetSize) / 2)
        $top = [int](($Height - $targetSize) / 2)
        $graphics.DrawImage($source, $left, $top, $targetSize, $targetSize)
    } finally {
        $source.Dispose()
        $graphics.Dispose()
    }

    $directory = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    try {
        $canvas.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $canvas.Dispose()
    }
}

$densities = [ordered]@{
    'mdpi' = 1.0
    'hdpi' = 1.5
    'xhdpi' = 2.0
    'xxhdpi' = 3.0
    'xxxhdpi' = 4.0
}

foreach ($entry in $densities.GetEnumerator()) {
    $legacySize = [int](48 * $entry.Value)
    $foregroundSize = [int](108 * $entry.Value)
    $folder = Join-Path $resRoot "mipmap-$($entry.Key)"
    Save-BrandedPng -Width $legacySize -Height $legacySize -LogoScale 0.72 -Destination (Join-Path $folder 'ic_launcher.png') -Transparent $false
    Save-BrandedPng -Width $legacySize -Height $legacySize -LogoScale 0.72 -Destination (Join-Path $folder 'ic_launcher_round.png') -Transparent $false
    Save-BrandedPng -Width $foregroundSize -Height $foregroundSize -LogoScale 0.60 -Destination (Join-Path $folder 'ic_launcher_foreground.png') -Transparent $true
}

$splashFiles = Get-ChildItem -LiteralPath $resRoot -Recurse -Filter 'splash.png' -File
foreach ($file in $splashFiles) {
    $existing = [System.Drawing.Image]::FromFile($file.FullName)
    try {
        $width = $existing.Width
        $height = $existing.Height
    } finally {
        $existing.Dispose()
    }
    Save-BrandedPng -Width $width -Height $height -LogoScale 0.18 -Destination $file.FullName -Transparent $false
}

Write-Host "Generated StudyStudio Android icons and splash images from $sourcePath"
