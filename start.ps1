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

function Get-RunningGatewayHealth {
  param([Parameter(Mandatory = $true)][string]$Port)

  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:${Port}/api/health" -TimeoutSec 2
    if ($response.gateway) {
      return $response
    }
  } catch {
    # The gateway is not listening yet, or the port belongs to another service.
  }
  return $null
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
$gatewayProcess = $null
$watchdogProcess = $null

# Keep this mutex for the full service lifetime. A second window must never
# detach the API from the console that owns its logs and shutdown lifecycle.
$mutexPort = $gatewayPort -replace "[^0-9A-Za-z_-]", "_"
$startupMutex = New-Object Threading.Mutex($false, "Local\StudyStudioLocalSearch_${mutexPort}")
$hasStartupMutex = $false
try {
  try {
    $hasStartupMutex = $startupMutex.WaitOne(0)
  } catch [Threading.AbandonedMutexException] {
    $hasStartupMutex = $true
  }

  if (-not $hasStartupMutex) {
    throw "搜索服务已由另一个启动窗口管理。请使用该窗口查看日志，关闭该窗口即可停止服务。"
  }

  # A healthy gateway without a mutex owner is left over from an older launcher.
  # Stop that exact listener before creating the new console-owned process.
  $gatewayHealth = Get-RunningGatewayHealth -Port $gatewayPort
  if ($gatewayHealth -and $gatewayHealth.status -eq "ok") {
    $listeners = @(
      Get-NetTCPConnection -State Listen -LocalPort ([int]$gatewayPort) -ErrorAction SilentlyContinue
    )
    $listenerProcessIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($listenerProcessIds.Count -eq 0) {
      throw "检测到搜索 API 正在运行，但无法确定其进程。请关闭旧服务后重试。"
    }
    Write-Host "检测到旧搜索 API 残留，正在关闭并重新绑定到当前窗口..." -ForegroundColor Yellow
    foreach ($listenerProcessId in $listenerProcessIds) {
      Stop-Process -Id $listenerProcessId -Force -ErrorAction SilentlyContinue
    }
    for ($attempt = 1; $attempt -le 20; $attempt++) {
      Start-Sleep -Milliseconds 250
      if (-not (Get-NetTCPConnection -State Listen -LocalPort ([int]$gatewayPort) -ErrorAction SilentlyContinue)) {
        break
      }
    }
    if (Get-NetTCPConnection -State Listen -LocalPort ([int]$gatewayPort) -ErrorAction SilentlyContinue) {
      throw "旧搜索 API 未能关闭，端口 ${gatewayPort} 仍被占用。"
    }
  }

Write-Host "[1/5] 正在检查 Docker Desktop..." -ForegroundColor Cyan
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "未找到 Docker CLI。请安装 Docker Desktop，然后重新运行 start.bat。"
}
Invoke-NativeCommand -Quiet { docker info }
if ($script:nativeExitCode -ne 0) {
  throw "Docker Desktop 未运行。请启动 Docker Desktop，然后重新运行 start.bat。"
}

try {
  Write-Host "[2/5] 正在启动本地 SearXNG..." -ForegroundColor Cyan
  Invoke-NativeCommand { docker compose -f $composeFile up -d }
  if ($script:nativeExitCode -ne 0) {
    throw "SearXNG 容器启动失败。"
  }
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
    throw "SearXNG 未能在 ${searxngUrl} 正常就绪。"
  }

  Write-Host "[3/5] 正在准备 Python 环境..." -ForegroundColor Cyan
  if (-not (Test-Path -LiteralPath $venvPython)) {
    $createdVenv = $false
    if (Get-Command py -ErrorAction SilentlyContinue) {
      Invoke-NativeCommand -Quiet { py -3.11 -m venv $venvRoot }
      $createdVenv = $script:nativeExitCode -eq 0
    }
    if (-not $createdVenv) {
      if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        throw "未找到 Python。请安装 Python 3.11 或更高版本。"
      }
      Invoke-NativeCommand { python -m venv $venvRoot }
      if ($script:nativeExitCode -ne 0) {
        throw "无法创建 Python 虚拟环境。请安装 Python 3.11 或更高版本。"
      }
    }
    if (-not (Test-Path -LiteralPath $venvPython)) {
      throw "Python 虚拟环境未能正确创建。"
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
        throw "Python 依赖安装失败。"
      }
      Set-Content -LiteralPath $requirementsStamp -Value $requirementsHash -Encoding ASCII
    } finally {
      Pop-Location
    }
  }

  Write-Host "[4/5] 正在检查 Playwright Chromium..." -ForegroundColor Cyan
  Invoke-NativeCommand { & $venvPython -m playwright install chromium }
  if ($script:nativeExitCode -ne 0) {
    throw "Playwright Chromium 安装失败。"
  }

  if ($VerifyOnly) {
    Push-Location $serviceRoot
    try {
      Invoke-NativeCommand { & $venvPython -c "from app.main import app; print(app.title)" }
      if ($script:nativeExitCode -ne 0) {
        throw "无法导入本地搜索 API。"
      }
    } finally {
      Pop-Location
    }
    Write-Host "搜索服务验证成功。" -ForegroundColor Green
    return
  }

  Write-Host "[5/5] 正在启动本地搜索 API..." -ForegroundColor Green
  Write-Host "API:  http://${gatewayHost}:${gatewayPort}/api" -ForegroundColor Magenta
  Write-Host "文档: http://${gatewayHost}:${gatewayPort}/docs" -ForegroundColor DarkGray
  Write-Host "使用搜索功能期间，请保持此窗口运行。" -ForegroundColor DarkGray

  Push-Location $serviceRoot
  try {
    $gatewayProcess = Start-Process `
      -FilePath $venvPython `
      -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", $gatewayHost, "--port", $gatewayPort) `
      -NoNewWindow `
      -PassThru
    $watchdogArgs = @(
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", ".\lifecycle-watchdog.ps1",
      "-OwnerPid", $PID,
      "-GatewayPid", $gatewayProcess.Id,
      "-GatewayStartTimeUtcTicks", $gatewayProcess.StartTime.ToUniversalTime().Ticks
    )
    if ($KeepSearxng) {
      $watchdogArgs += "-KeepSearxng"
    }
    $watchdogProcess = Start-Process `
      -FilePath (Join-Path $PSHOME "powershell.exe") `
      -ArgumentList $watchdogArgs `
      -WorkingDirectory $serviceRoot `
      -WindowStyle Hidden `
      -PassThru
    $gatewayReady = $false
    for ($attempt = 1; $attempt -le 30; $attempt++) {
      Start-Sleep -Seconds 1
      if ($gatewayProcess.HasExited) {
        break
      }
      $gatewayHealth = Get-RunningGatewayHealth -Port $gatewayPort
      if ($gatewayHealth -and $gatewayHealth.status -eq "ok") {
        $gatewayReady = $true
        break
      }
    }
    if (-not $gatewayReady) {
      if (-not $gatewayProcess.HasExited) {
        Invoke-NativeCommand -Quiet { taskkill.exe /PID $gatewayProcess.Id /T /F }
      }
      throw "本地搜索 API 未能在 30 秒内启动。"
    }

    $gatewayProcess.WaitForExit()
    if ($gatewayProcess.ExitCode -ne 0) {
      throw "本地搜索 API 已停止，退出代码：$($gatewayProcess.ExitCode)。"
    }
  } finally {
    Pop-Location
  }
} finally {
  if ($gatewayProcess -and -not $gatewayProcess.HasExited) {
    Invoke-NativeCommand -Quiet { taskkill.exe /PID $gatewayProcess.Id /T /F }
  }
  if (-not $KeepSearxng) {
    Write-Host "正在停止 SearXNG..." -ForegroundColor DarkGray
    Invoke-NativeCommand -Quiet { docker compose -f $composeFile stop }
  }
  if ($watchdogProcess -and -not $watchdogProcess.HasExited) {
    Stop-Process -Id $watchdogProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
} finally {
  if ($hasStartupMutex) {
    $startupMutex.ReleaseMutex()
  }
  $startupMutex.Dispose()
}
