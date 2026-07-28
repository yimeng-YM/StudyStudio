$ErrorActionPreference = "Stop"

function Invoke-NativeCommand {
  param([Parameter(Mandatory = $true)][scriptblock]$Command)

  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & $Command 2>&1 | ForEach-Object { Write-Host $_ }
    $script:nativeExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

$serviceRoot = $PSScriptRoot
$venvRoot = Join-Path $serviceRoot ".venv"
$venvPython = Join-Path $venvRoot "Scripts\python.exe"
$requirements = Join-Path $serviceRoot "requirements-dev.txt"
$projectMetadata = Join-Path $serviceRoot "pyproject.toml"
$requirementsStamp = Join-Path $venvRoot "requirements-dev.sha256"

if (-not (Test-Path -LiteralPath $venvPython)) {
  $createdVenv = $false
  if (Get-Command py -ErrorAction SilentlyContinue) {
    Invoke-NativeCommand { py -3.11 -m venv $venvRoot }
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

Push-Location $serviceRoot
try {
  if ($requirementsHash -ne $installedHash) {
    Invoke-NativeCommand {
      & $venvPython -m pip install --disable-pip-version-check -r $requirements
    }
    if ($script:nativeExitCode -ne 0) {
      throw "Python test dependency installation failed."
    }
    Set-Content -LiteralPath $requirementsStamp -Value $requirementsHash -Encoding ASCII
  }

  Invoke-NativeCommand { & $venvPython -m pytest }
  if ($script:nativeExitCode -ne 0) {
    throw "Search service tests failed with exit code $script:nativeExitCode."
  }
} finally {
  Pop-Location
}
