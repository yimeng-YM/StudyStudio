param(
  [switch]$VerifyOnly,
  [switch]$KeepSearxng
)

$ErrorActionPreference = "Stop"
$searchLauncher = Join-Path (Split-Path -Parent $PSScriptRoot) "search\start.ps1"
if (-not (Test-Path -LiteralPath $searchLauncher)) {
  throw @"
尚未安装独立搜索服务。
请在 StudyStudio 仓库根目录执行以下命令：
git clone --branch search --single-branch https://github.com/yimeng-YM/StudyStudio.git search
"@
}
try {
  & $searchLauncher @PSBoundParameters
} catch {
  Write-Error $_
  exit 1
}
