[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$ManifestPath = Join-Path $Root "manifest.json"
$AllowlistPath = Join-Path $PSScriptRoot "package-files.json"

if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    throw "manifest.json was not found at the repository root."
}

$Manifest = [IO.File]::ReadAllText($ManifestPath) | ConvertFrom-Json
if ($Manifest.version -notmatch '^\d+\.\d+\.\d+(?:\.\d+)?$') {
    throw "manifest.json contains an invalid Chrome extension version."
}

$AllowlistDocument = [IO.File]::ReadAllText($AllowlistPath) | ConvertFrom-Json
$Allowlist = @(foreach ($Item in $AllowlistDocument) { [string]$Item })
if ($Allowlist.Count -eq 0) {
    throw "The package allowlist is empty."
}

$Utf8NoBom = New-Object Text.UTF8Encoding($false, $true)

function Get-PackageBytes {
    param([string]$Path)

    $Bytes = [IO.File]::ReadAllBytes($Path)
    if ([IO.Path]::GetExtension($Path) -ceq ".png") {
        return ,$Bytes
    }

    # Checkout settings must not change the Chrome Web Store artifact.
    $Text = $Utf8NoBom.GetString($Bytes)
    if ($Text.Length -gt 0 -and $Text[0] -eq [char]0xfeff) {
        $Text = $Text.Substring(1)
    }
    $Text = $Text.Replace("`r`n", "`n").Replace("`r", "`n")
    return ,$Utf8NoBom.GetBytes($Text)
}

$DuplicatePaths = @($Allowlist | Group-Object | Where-Object Count -gt 1)
if ($DuplicatePaths.Count -gt 0) {
    throw "The package allowlist contains duplicate paths."
}

foreach ($RelativePath in $Allowlist) {
    if (
        [IO.Path]::IsPathRooted($RelativePath) -or
        $RelativePath.Contains("\") -or
        $RelativePath -match '(^|/)\.\.(/|$)'
    ) {
        throw "Unsafe package path: $RelativePath"
    }

    $SourcePath = Join-Path $Root ($RelativePath.Replace('/', [IO.Path]::DirectorySeparatorChar))
    if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
        throw "Allowlisted file is missing: $RelativePath"
    }
}

$DistPath = Join-Path $Root "dist"
if (-not (Test-Path -LiteralPath $DistPath -PathType Container)) {
    $null = New-Item -ItemType Directory -Path $DistPath
}

$OutputPath = Join-Path $DistPath ("chune-id-{0}.zip" -f $Manifest.version)
if (Test-Path -LiteralPath $OutputPath) {
    [IO.File]::Delete($OutputPath)
}

Add-Type -AssemblyName System.IO.Compression
$FileStream = [IO.File]::Open($OutputPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
$Archive = $null
$SortedAllowlist = @($Allowlist)
[Array]::Sort($SortedAllowlist, [StringComparer]::Ordinal)

try {
    $Archive = New-Object IO.Compression.ZipArchive(
        $FileStream,
        [IO.Compression.ZipArchiveMode]::Create,
        $false
    )
    $FixedTimestamp = New-Object DateTimeOffset(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)

    foreach ($RelativePath in $SortedAllowlist) {
        $SourcePath = Join-Path $Root ($RelativePath.Replace('/', [IO.Path]::DirectorySeparatorChar))
        $Entry = $Archive.CreateEntry(
            $RelativePath,
            [IO.Compression.CompressionLevel]::Optimal
        )
        $Entry.LastWriteTime = $FixedTimestamp
        $Bytes = Get-PackageBytes $SourcePath
        $OutputStream = $Entry.Open()

        try {
            $OutputStream.Write($Bytes, 0, $Bytes.Length)
        }
        finally {
            $OutputStream.Dispose()
        }
    }
}
finally {
    if ($null -ne $Archive) {
        $Archive.Dispose()
    }
    $FileStream.Dispose()
}

$Hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
"Created $OutputPath"
"SHA-256 $Hash"
