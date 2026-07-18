[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$Validator = Join-Path $PSScriptRoot "validate.mjs"
$Node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue

if (-not $Node) {
    throw "Node.js is required to validate the extension."
}
if (-not (Test-Path -LiteralPath (Join-Path $Root "manifest.json") -PathType Leaf)) {
    throw "manifest.json was not found at the repository root."
}
if (-not (Test-Path -LiteralPath $Validator -PathType Leaf)) {
    throw "The source validator is missing: $Validator"
}

& $Node.Source $Validator
if ($LASTEXITCODE -ne 0) {
    throw "Extension source validation failed with exit code $LASTEXITCODE."
}
