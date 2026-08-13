[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidSdk = if ($env:ANDROID_HOME) {
    $env:ANDROID_HOME
} elseif ($env:ANDROID_SDK_ROOT) {
    $env:ANDROID_SDK_ROOT
} else {
    Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}

$javaCandidates = @(@(
    $env:JAVA_HOME,
    'D:\HMCL\Java\java21',
    'C:\Program Files\Android\Android Studio\jbr'
) | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'bin\java.exe')) })

if (-not (Test-Path -LiteralPath $androidSdk)) {
    throw "Android SDK not found. Set ANDROID_HOME before running this script."
}
if (-not $javaCandidates) {
    throw "JDK 21 not found. Set JAVA_HOME to a JDK 21 installation."
}

$env:JAVA_HOME = $javaCandidates[0]
$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk

Push-Location $projectRoot
try {
    npm run android:assets
    if ($LASTEXITCODE -ne 0) { throw "Android asset generation failed with exit code $LASTEXITCODE." }

    npm run android:sync
    if ($LASTEXITCODE -ne 0) { throw "Capacitor sync failed with exit code $LASTEXITCODE." }

    Push-Location (Join-Path $projectRoot 'android')
    try {
        $buildSucceeded = $false
        for ($attempt = 1; $attempt -le 4; $attempt++) {
            # Gradle emits normal warnings on stderr. Temporarily relax native
            # command handling so those lines do not become terminating errors.
            $previousErrorActionPreference = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            try {
                $buildOutput = @(.\gradlew.bat :app:assembleDebug --console=plain --no-daemon 2>&1)
                $buildExitCode = $LASTEXITCODE
            } finally {
                $ErrorActionPreference = $previousErrorActionPreference
            }
            $buildOutput | ForEach-Object { Write-Host $_.ToString() }
            if ($buildExitCode -eq 0) {
                $buildSucceeded = $true
                break
            }

            $outputText = $buildOutput -join [Environment]::NewLine
            if ($outputText -notmatch 'FileLockContentionHandler|Address already in use: bind' -or $attempt -eq 4) {
                throw "Android build failed with exit code $buildExitCode."
            }
            Write-Warning "Gradle hit a transient Windows UDP file-lock port conflict; retrying ($attempt/4)."
            Start-Sleep -Milliseconds 500
        }
        if (-not $buildSucceeded) { throw 'Android build did not complete.' }
    } finally {
        Pop-Location
    }

    $package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
    $sourceApk = Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
    $releaseDir = Join-Path $projectRoot 'release'
    $releaseApk = Join-Path $releaseDir "StudyStudio-v$($package.version)-debug.apk"
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
    Copy-Item -LiteralPath $sourceApk -Destination $releaseApk -Force

    $artifact = Get-Item -LiteralPath $releaseApk
    $hash = Get-FileHash -LiteralPath $releaseApk -Algorithm SHA256
    Write-Host "APK: $($artifact.FullName)"
    Write-Host "Size: $($artifact.Length) bytes"
    Write-Host "SHA-256: $($hash.Hash)"
} finally {
    Pop-Location
}
