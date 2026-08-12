param(
  [Parameter(Mandatory = $true)][int]$OwnerPid,
  [Parameter(Mandatory = $true)][int]$GatewayPid,
  [Parameter(Mandatory = $true)][long]$GatewayStartTimeUtcTicks,
  [switch]$KeepSearxng
)

$ErrorActionPreference = "SilentlyContinue"

# The watchdog is detached from the service console. If that window is closed,
# PowerShell may not have time to run finally, so this process completes cleanup.
Wait-Process -Id $OwnerPid

$gateway = Get-Process -Id $GatewayPid -ErrorAction SilentlyContinue
if (
  $gateway -and
  $gateway.StartTime.ToUniversalTime().Ticks -eq $GatewayStartTimeUtcTicks
) {
  & taskkill.exe /PID $GatewayPid /T /F *> $null
}

if (-not $KeepSearxng) {
  $composeFile = Join-Path $PSScriptRoot "docker-compose.yml"
  & docker compose -f $composeFile stop *> $null
}
