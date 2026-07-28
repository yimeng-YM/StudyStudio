param(
  [switch]$VerifyOnly,
  [switch]$KeepSearxng
)

$ErrorActionPreference = "Stop"
$searchLauncher = Join-Path (Split-Path -Parent $PSScriptRoot) "search\start.ps1"
if (-not (Test-Path -LiteralPath $searchLauncher)) {
  throw @"
The independent search service is not installed.
Run this command from the StudyStudio repository root:
git clone --branch search --single-branch https://github.com/yimeng-YM/StudyStudio.git search
"@
}
try {
  & $searchLauncher @PSBoundParameters
} catch {
  Write-Error $_
  exit 1
}
