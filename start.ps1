param(
  [switch]$VerifyOnly,
  [switch]$KeepSearxng
)

$ErrorActionPreference = "Stop"

function Import-LocalEnvironment {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }
  foreach ($rawLine in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      continue
    }
    $parts = $line.Split("=", 2)
    if ($parts.Count -ne 2) {
      continue
    }
    $name = $parts[0].Trim()
    if ($name -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") {
      continue
    }
    if ($null -ne [Environment]::GetEnvironmentVariable($name, "Process")) {
      continue
    }
    $value = $parts[1].Trim()
    if (
      $value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or
       ($value.StartsWith("'") -and $value.EndsWith("'")))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

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

$serviceRoot = $PSScriptRoot
Import-LocalEnvironment -Path (Join-Path $serviceRoot ".env")

$venvRoot = Join-Path $serviceRoot ".venv"
$venvPython = Join-Path $venvRoot "Scripts\python.exe"
$requirements = Join-Path $serviceRoot "requirements.txt"
$projectMetadata = Join-Path $serviceRoot "pyproject.toml"
$requirementsStamp = Join-Path $venvRoot "requirements.sha256"
$composeFile = Join-Path $serviceRoot "docker-compose.yml"
$gatewayHost = if ($env:LOCAL_SEARCH_HOST) {
  $env:LOCAL_SEARCH_HOST
} elseif ($env:STUDYSTUDIO_HOST) {
  $env:STUDYSTUDIO_HOST
} else {
  "127.0.0.1"
}
$gatewayPort = if ($env:LOCAL_SEARCH_PORT) {
  $env:LOCAL_SEARCH_PORT
} elseif ($env:STUDYSTUDIO_PORT) {
  $env:STUDYSTUDIO_PORT
} else {
  "17890"
}
$searxngPort = if ($env:SEARXNG_PORT) { $env:SEARXNG_PORT } else { "17891" }
$searxngUrl = if ($env:SEARXNG_URL) {
  $env:SEARXNG_URL.TrimEnd("/")
} else {
  "http://127.0.0.1:${searxngPort}"
}
$searxngStarted = $false

Write-Host "[1/5] Checking Docker Desktop..." -ForegroundColor Cyan
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker CLI was not found. Install Docker Desktop, then run start.bat again."
}
Invoke-NativeCommand -Quiet { docker info }
if ($script:nativeExitCode -ne 0) {
  throw "Docker Desktop is not running. Start Docker Desktop, then run start.bat again."
}

try {
  Write-Host "[2/5] Starting local SearXNG..." -ForegroundColor Cyan
  Invoke-NativeCommand { docker compose -f $composeFile up -d }
  if ($script:nativeExitCode -ne 0) {
    throw "The SearXNG container failed to start."
  }
  $searxngStarted = $true

  $searxngReady = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "${searxngUrl}/" -TimeoutSec 2
      if ($response.StatusCode -lt 500) {
        $searxngReady = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  if (-not $searxngReady) {
    throw "SearXNG did not become ready at ${searxngUrl}."
  }

  Write-Host "[3/5] Preparing the Python environment..." -ForegroundColor Cyan
  if (-not (Test-Path -LiteralPath $venvPython)) {
    $createdVenv = $false
    if (Get-Command py -ErrorAction SilentlyContinue) {
      Invoke-NativeCommand -Quiet { py -3.11 -m venv $venvRoot }
      $createdVenv = $script:nativeExitCode -eq 0
    }
    if (-not $createdVenv) {
      if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        throw "Python was not found. Install Python 3.11 or newer."
      }
      Invoke-NativeCommand { python -m venv $venvRoot }
      if ($script:nativeExitCode -ne 0) {
        throw "Could not create a Python virtual environment. Install Python 3.11 or newer."
      }
    }
    if (-not (Test-Path -LiteralPath $venvPython)) {
      throw "The Python virtual environment was not created correctly."
    }
  }

  $requirementsHash = (
    (Get-FileHash -Algorithm SHA256 -LiteralPath $requirements).Hash +
    ":" +
    (Get-FileHash -Algorithm SHA256 -LiteralPath $projectMetadata).Hash
  )
  $installedHash = if (Test-Path -LiteralPath $requirementsStamp) {
    (Get-Content -Raw -LiteralPath $requirementsStamp).Trim()
  } else {
    ""
  }
  if ($requirementsHash -ne $installedHash) {
    Push-Location $serviceRoot
    try {
      Invoke-NativeCommand { & $venvPython -m pip install --disable-pip-version-check -r $requirements }
      if ($script:nativeExitCode -ne 0) {
        throw "Python dependency installation failed."
      }
      Set-Content -LiteralPath $requirementsStamp -Value $requirementsHash -Encoding ASCII
    } finally {
      Pop-Location
    }
  }

  Write-Host "[4/5] Checking Playwright Chromium..." -ForegroundColor Cyan
  Invoke-NativeCommand { & $venvPython -m playwright install chromium }
  if ($script:nativeExitCode -ne 0) {
    throw "Playwright Chromium installation failed."
  }

  if ($VerifyOnly) {
    Push-Location $serviceRoot
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
  Write-Host "Keep this window open while search is in use." -ForegroundColor DarkGray

  Push-Location $serviceRoot
  try {
    & $venvPython -m uvicorn app.main:app --host $gatewayHost --port $gatewayPort
    if ($LASTEXITCODE -ne 0) {
      throw "The local search API stopped with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
} finally {
  if ($searxngStarted -and -not $KeepSearxng) {
    Write-Host "Stopping SearXNG..." -ForegroundColor DarkGray
    Invoke-NativeCommand -Quiet { docker compose -f $composeFile stop }
  }
}
