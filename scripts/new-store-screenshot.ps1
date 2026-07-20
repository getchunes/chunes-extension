[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$PopupWidth = 380
$PopupHeight = 560
$EdgeCandidates = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
$Edge = $EdgeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $Edge) {
    throw "Microsoft Edge is required to render the popup fixture."
}

function Remove-ProfileDirectory {
    param([string]$Path)

    for ($Attempt = 0; $Attempt -lt 50; $Attempt++) {
        if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
            return
        }

        try {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
            return
        }
        catch {
            if ($Attempt -eq 49) {
                throw
            }
            Start-Sleep -Milliseconds 100
        }
    }
}

$DistPath = Join-Path $Root "dist"
if (-not (Test-Path -LiteralPath $DistPath -PathType Container)) {
    $null = New-Item -ItemType Directory -Path $DistPath
}

$OutputDirectory = Join-Path $Root "store/screenshots"
if (-not (Test-Path -LiteralPath $OutputDirectory -PathType Container)) {
    $null = New-Item -ItemType Directory -Path $OutputDirectory
}

$CapturePath = Join-Path $DistPath "popup-fixture.png"
$ProfilePath = Join-Path $DistPath "edge-screenshot-profile"
$OutputPath = Join-Path $OutputDirectory "popup-1280x800.png"
$PopupUri = ([Uri](Resolve-Path -LiteralPath (Join-Path $Root "popup.html")).Path).AbsoluteUri

if (Test-Path -LiteralPath $CapturePath) {
    [IO.File]::Delete($CapturePath)
}
Remove-ProfileDirectory $ProfilePath

& $Edge @(
    "--headless=new",
    "--disable-background-mode",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-features=msEdgeEDrop",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--user-data-dir=$ProfilePath",
    "--window-size=$PopupWidth,$PopupHeight",
    "--screenshot=$CapturePath",
    $PopupUri
)

for ($Attempt = 0; $Attempt -lt 50 -and -not (Test-Path -LiteralPath $CapturePath -PathType Leaf); $Attempt++) {
    Start-Sleep -Milliseconds 100
}

if (-not (Test-Path -LiteralPath $CapturePath -PathType Leaf)) {
    throw "Edge did not render the popup fixture."
}

Add-Type -AssemblyName System.Drawing
$Canvas = New-Object Drawing.Bitmap(1280, 800, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
$Graphics = [Drawing.Graphics]::FromImage($Canvas)
$Popup = [Drawing.Image]::FromFile($CapturePath)
$TitleFont = New-Object Drawing.Font("Segoe UI", 37, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
$SubtitleFont = New-Object Drawing.Font("Segoe UI", 18, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$LabelFont = New-Object Drawing.Font("Segoe UI", 12, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
$FeatureFont = New-Object Drawing.Font("Segoe UI", 16, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$WhiteBrush = New-Object Drawing.SolidBrush([Drawing.Color]::White)
$InkBrush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(255, 36, 38, 48))
$MutedBrush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(255, 91, 95, 111))
$PurpleBrush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(255, 88, 101, 242))
$ShadowBrush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(28, 32, 34, 44))
$Icon = [Drawing.Image]::FromFile((Join-Path $Root "icons/icon-128.png"))

try {
    $Graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $Graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $Graphics.Clear([Drawing.Color]::FromArgb(255, 242, 243, 248))
    # Sized and anchored to frame only the logo mark; its bottom-most point
    # (at its horizontal center) lands at y=150, well clear of the title
    # starting at y=183, so body text never crosses its edge.
    $Graphics.FillEllipse($PurpleBrush, -170, -250, 400, 400)
    $Graphics.FillEllipse((New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(22, 88, 101, 242))), 940, 570, 420, 420)

    $Graphics.DrawImage($Icon, 35, 30, 90, 90)
    $Graphics.DrawString("Music presence,`nproperly identified.", $TitleFont, $InkBrush, 74, 183)
    # The purple circle's bounding box (-170, -250, 600, 600) bottoms out at
    # y=350 (at its horizontal center, x=130); keep body text below that so
    # it never crosses the circle's edge.
    $Graphics.DrawString("A local browser companion for Chunes desktop.", $SubtitleFont, $MutedBrush, 78, 358)

    $Features = @(
        "SoundCloud, YouTube Music, and Apple Music publish controls",
        "Regular YouTube stays classified as blocked",
        "Direct extension reports go only to local Chunes"
    )
    $Y = 410
    foreach ($Feature in $Features) {
        $Graphics.FillEllipse($PurpleBrush, 80, $Y + 7, 8, 8)
        $Graphics.DrawString($Feature, $FeatureFont, $InkBrush, 102, $Y)
        $Y += 48
    }

    $Graphics.DrawString("Requires the Chunes Windows companion app", $LabelFont, $MutedBrush, 79, 579)
    $Graphics.FillRectangle($ShadowBrush, 790, 90, 400, ($PopupHeight + 20))
    $Graphics.FillRectangle($WhiteBrush, 780, 80, 400, ($PopupHeight + 20))
    $Graphics.DrawImage($Popup, 790, 90, $PopupWidth, $PopupHeight)

    $Canvas.Save($OutputPath, [Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $Icon.Dispose()
    $ShadowBrush.Dispose()
    $PurpleBrush.Dispose()
    $MutedBrush.Dispose()
    $InkBrush.Dispose()
    $WhiteBrush.Dispose()
    $FeatureFont.Dispose()
    $LabelFont.Dispose()
    $SubtitleFont.Dispose()
    $TitleFont.Dispose()
    $Popup.Dispose()
    $Graphics.Dispose()
    $Canvas.Dispose()
    [IO.File]::Delete($CapturePath)
    Remove-ProfileDirectory $ProfilePath
}

"Created $OutputPath"
