[CmdletBinding()]
param(
    [string]$PackagePath
)

$ErrorActionPreference = "Stop"
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$ManifestPath = Join-Path $Root "manifest.json"
$AllowlistPath = Join-Path $PSScriptRoot "package-files.json"

if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    throw "manifest.json was not found at the repository root."
}
if (-not (Test-Path -LiteralPath $AllowlistPath -PathType Leaf)) {
    throw "The package allowlist was not found."
}

$Manifest = [IO.File]::ReadAllText($ManifestPath) | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($PackagePath)) {
    $PackagePath = Join-Path $Root ("dist/chune-id-{0}.zip" -f $Manifest.version)
}
elseif (-not [IO.Path]::IsPathRooted($PackagePath)) {
    $PackagePath = Join-Path $Root $PackagePath
}

if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) {
    throw "Package not found: $PackagePath"
}

$ExpectedName = "chune-id-{0}.zip" -f $Manifest.version
if ([IO.Path]::GetFileName($PackagePath) -cne $ExpectedName) {
    throw "Package name must be $ExpectedName"
}

$AllowlistDocument = [IO.File]::ReadAllText($AllowlistPath) | ConvertFrom-Json
$ExpectedEntries = @(foreach ($Item in $AllowlistDocument) { [string]$Item })
[Array]::Sort($ExpectedEntries, [StringComparer]::Ordinal)

$Utf8NoBom = New-Object Text.UTF8Encoding($false, $true)

function Get-PackageBytes {
    param([string]$Path)

    $Bytes = [IO.File]::ReadAllBytes($Path)
    if ([IO.Path]::GetExtension($Path) -ceq ".png") {
        return ,$Bytes
    }

    $Text = $Utf8NoBom.GetString($Bytes)
    if ($Text.Length -gt 0 -and $Text[0] -eq [char]0xfeff) {
        $Text = $Text.Substring(1)
    }
    $Text = $Text.Replace("`r`n", "`n").Replace("`r", "`n")
    return ,$Utf8NoBom.GetBytes($Text)
}

function Get-BytesSha256 {
    param([byte[]]$Bytes)

    $Algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        $HashBytes = $Algorithm.ComputeHash($Bytes)
        return ([BitConverter]::ToString($HashBytes)).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $Algorithm.Dispose()
    }
}

function Get-PngDimensions {
    param($Entry)

    $Stream = $Entry.Open()
    try {
        $Header = New-Object byte[] 24
        $Offset = 0
        while ($Offset -lt $Header.Length) {
            $Read = $Stream.Read($Header, $Offset, $Header.Length - $Offset)
            if ($Read -eq 0) {
                break
            }
            $Offset += $Read
        }
    }
    finally {
        $Stream.Dispose()
    }

    if ($Offset -ne $Header.Length) {
        throw "$($Entry.FullName) is too short to be a PNG."
    }

    $Signature = @(137, 80, 78, 71, 13, 10, 26, 10)
    for ($Index = 0; $Index -lt $Signature.Count; $Index++) {
        if ($Header[$Index] -ne $Signature[$Index]) {
            throw "$($Entry.FullName) is not a PNG."
        }
    }
    if ([Text.Encoding]::ASCII.GetString($Header, 12, 4) -cne "IHDR") {
        throw "$($Entry.FullName) has no PNG IHDR."
    }

    return @(
        [Net.IPAddress]::NetworkToHostOrder([BitConverter]::ToInt32($Header, 16)),
        [Net.IPAddress]::NetworkToHostOrder([BitConverter]::ToInt32($Header, 20))
    )
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$Archive = [IO.Compression.ZipFile]::OpenRead($PackagePath)

try {
    $DirectoryEntries = @($Archive.Entries | Where-Object { $_.FullName.EndsWith('/') })
    if ($DirectoryEntries.Count -gt 0) {
        throw "Package must not contain directory entries."
    }

    $ArchiveEntries = @(
        $Archive.Entries |
            Where-Object { -not $_.FullName.EndsWith('/') } |
            ForEach-Object { $_ }
    )
    $ActualEntries = @($ArchiveEntries | ForEach-Object FullName)

    if ($ActualEntries.Count -ne (@($ActualEntries | Select-Object -Unique)).Count) {
        throw "Package contains duplicate archive entries."
    }

    $SortedActualEntries = @($ActualEntries)
    [Array]::Sort($SortedActualEntries, [StringComparer]::Ordinal)
    $Difference = @(Compare-Object -ReferenceObject $ExpectedEntries -DifferenceObject $SortedActualEntries -CaseSensitive)
    if ($Difference.Count -gt 0) {
        $Details = ($Difference | ForEach-Object { "{0} {1}" -f $_.SideIndicator, $_.InputObject }) -join '; '
        throw "Package entries do not match the allowlist: $Details"
    }
    if (($ActualEntries -join "`n") -cne ($ExpectedEntries -join "`n")) {
        throw "Package entries are not in deterministic ordinal order."
    }

    $FixedTimestamp = New-Object DateTimeOffset(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
    foreach ($Entry in $ArchiveEntries) {
        if ($Entry.LastWriteTime.DateTime -ne $FixedTimestamp.DateTime) {
            throw "Package entry has a non-deterministic timestamp: $($Entry.FullName)"
        }

        $ArchivedStream = $Entry.Open()
        $ArchivedMemory = $null
        try {
            $ArchivedMemory = New-Object IO.MemoryStream
            $ArchivedStream.CopyTo($ArchivedMemory)
            $ArchivedBytes = $ArchivedMemory.ToArray()
        }
        finally {
            if ($null -ne $ArchivedMemory) {
                $ArchivedMemory.Dispose()
            }
            $ArchivedStream.Dispose()
        }

        if (
            [IO.Path]::GetExtension($Entry.FullName) -cne ".png" -and
            $ArchivedBytes -contains [byte]13
        ) {
            throw "Package text entry does not use canonical LF line endings: $($Entry.FullName)"
        }
        $ArchivedHash = Get-BytesSha256 $ArchivedBytes

        $SourcePath = Join-Path $Root ($Entry.FullName.Replace('/', [IO.Path]::DirectorySeparatorChar))
        $SourceHash = Get-BytesSha256 (Get-PackageBytes $SourcePath)
        if ($ArchivedHash -cne $SourceHash) {
            throw "Package entry differs from the canonical current source: $($Entry.FullName)"
        }
    }

    $RootManifest = @($Archive.Entries | Where-Object FullName -CEQ "manifest.json")
    if ($RootManifest.Count -ne 1) {
        throw "Package must contain exactly one manifest.json at the archive root."
    }

    $Reader = New-Object IO.StreamReader($RootManifest[0].Open())
    try {
        $ArchivedManifestText = $Reader.ReadToEnd()
    }
    finally {
        $Reader.Dispose()
    }

    $ArchivedManifest = $ArchivedManifestText | ConvertFrom-Json
    if ($ArchivedManifest.version -cne $Manifest.version) {
        throw "Archived manifest version does not match the source manifest."
    }
    if ($ArchivedManifest.name -cne "Chune ID") {
        throw "Archived manifest name is not Chune ID."
    }
    if ($ArchivedManifest.manifest_version -ne 3) {
        throw "Archived manifest is not Manifest V3."
    }
    if ($ArchivedManifest.minimum_chrome_version -cne "120") {
        throw "Archived manifest minimum Chrome version is not 120."
    }

    $ExpectedIconDimensions = @{
        "icons/action-16.png" = @(16, 16)
        "icons/action-32.png" = @(32, 32)
        "icons/icon-16.png" = @(16, 16)
        "icons/icon-32.png" = @(32, 32)
        "icons/icon-48.png" = @(48, 48)
        "icons/icon-128.png" = @(128, 128)
    }
    foreach ($IconPath in $ExpectedIconDimensions.Keys) {
        $IconEntry = @($ArchiveEntries | Where-Object FullName -CEQ $IconPath)
        if ($IconEntry.Count -ne 1) {
            throw "Package must contain exactly one $IconPath entry."
        }

        $ActualDimensions = @(Get-PngDimensions ($IconEntry[0]))
        $ExpectedDimensions = $ExpectedIconDimensions[$IconPath]
        if (
            $ActualDimensions[0] -ne $ExpectedDimensions[0] -or
            $ActualDimensions[1] -ne $ExpectedDimensions[1]
        ) {
            throw "$IconPath must be $($ExpectedDimensions[0])x$($ExpectedDimensions[1]), found $($ActualDimensions[0])x$($ActualDimensions[1])."
        }
    }
}
finally {
    $Archive.Dispose()
}

$Hash = (Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash.ToLowerInvariant()
"Package validation passed: $PackagePath"
"SHA-256 $Hash"
