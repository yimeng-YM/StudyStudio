param(
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Command,
    [switch]$Quiet
  )

  $previousPreference = $ErrorActionPreference
  try {
    # Windows PowerShell 5 promotes some native stderr output to ErrorRecord.
    $ErrorActionPreference = "Continue"
    if ($Quiet) {
      & $Command 2>&1 | Out-Null
    } else {
      & $Command 2>&1 | ForEach-Object { Write-Host $_ }
    }
    $script:nativeExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot "backend"
$venvRoot = Join-Path $backendRoot ".venv"
$venvPython = Join-Path $venvRoot "Scripts\python.exe"
$requirements = Join-Path $backendRoot "requirements.txt"
$requirementsStamp = Join-Path $venvRoot "requirements.sha256"
$composeFile = Join-Path $projectRoot "docker-compose.local.yml"
$gatewayHost = if ($env:STUDYSTUDIO_HOST) { $env:STUDYSTUDIO_HOST } else { "127.0.0.1" }
$gatewayPort = if ($env:STUDYSTUDIO_PORT) { $env:STUDYSTUDIO_PORT } else { "17890" }
$searxngStarted = $false

Write-Host "[1/5] Checking Docker Desktop..." -ForegroundColor Cyan
Invoke-NativeCommand -Quiet { docker info }
if ($script:nativeExitCode -ne 0) {
  throw "Docker Desktop is not running. Start Docker Desktop, then run start-search.bat again."
}

try {
  Write-Host "[2/5] Starting local SearXNG..." -ForegroundColor Cyan
  Invoke-NativeCommand { docker compose -f $composeFile up -d }
  if ($script:nativeExitCode -ne 0) {
    throw "The SearXNG container failed to start."
  }
  $searxngStarted = $true

  Write-Host "[3/5] Preparing the Python environment..." -ForegroundColor Cyan
  if (-not (Test-Path -LiteralPath $venvPython)) {
    $createdVenv = $false
    try {
      Invoke-NativeCommand -Quiet { py -3.11 -m venv $venvRoot }
      $createdVenv = $script:nativeExitCode -eq 0
    } catch { }
    if (-not $createdVenv) {
      Invoke-NativeCommand { python -m venv $venvRoot }
      if ($script:nativeExitCode -ne 0) {
        throw "Could not create a Python virtual environment. Install Python 3.11 or newer."
      }
    }
  }

  $requirementsHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $requirements).Hash
  $installedHash = if (Test-Path -LiteralPath $requirementsStamp) {
    (Get-Content -Raw -LiteralPath $requirementsStamp).Trim()
  } else {
    ""
  }
  if ($requirementsHash -ne $installedHash) {
    Invoke-NativeCommand { & $venvPython -m pip install --disable-pip-version-check -r $requirements }
    if ($script:nativeExitCode -ne 0) {
      throw "Python dependency installation failed."
    }
    Set-Content -LiteralPath $requirementsStamp -Value $requirementsHash -Encoding ASCII
  }

  Write-Host "[4/5] Checking Playwright Chromium..." -ForegroundColor Cyan
  Invoke-NativeCommand { & $venvPython -m playwright install chromium }
  if ($script:nativeExitCode -ne 0) {
    throw "Playwright Chromium installation failed."
  }

  if ($VerifyOnly) {
    Push-Location $backendRoot
    try {
      Invoke-NativeCommand { & $venvPython -c "from app.main import app; print(app.title)" }
      if ($script:nativeExitCode -ne 0) {
        throw "The local search API could not be imported."
      }
    } finally {
      Pop-Location
    }
    Write-Host "Search service verification completed successfully." -ForegroundColor Green
    return
  }

  Write-Host "[5/5] Starting the local search API..." -ForegroundColor Green
  Write-Host "API:  http://${gatewayHost}:${gatewayPort}/api" -ForegroundColor Magenta
  Write-Host "Docs: http://${gatewayHost}:${gatewayPort}/docs" -ForegroundColor DarkGray
  Write-Host "The frontend remains on http://localhost:5173." -ForegroundColor DarkGray
  Write-Host "Keep this window open while search is in use." -ForegroundColor DarkGray

  Push-Location $backendRoot
  try {
    & $venvPython -m uvicorn app.main:app --host $gatewayHost --port $gatewayPort
    if ($LASTEXITCODE -ne 0) {
      throw "The local search API stopped with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
} finally {
  if ($searxngStarted) {
    Write-Host "Stopping SearXNG..." -ForegroundColor DarkGray
    Invoke-NativeCommand -Quiet { docker compose -f $composeFile stop }
  }
}
