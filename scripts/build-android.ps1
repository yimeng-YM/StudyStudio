[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot 'android'
$manifestPath = Join-Path $androidRoot 'app\src\main\AndroidManifest.xml'
$appGradlePath = Join-Path $androidRoot 'app\build.gradle'
$sourceApk = Join-Path $androidRoot 'app\build\outputs\apk\debug\app-debug.apk'
$releaseRoot = Join-Path $projectRoot 'release'
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$versionName = [string]$package.version
$releaseApk = Join-Path $releaseRoot "StudyStudio-v$versionName-debug.apk"

if ($versionName -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
    throw 'package.json version must be a semantic version such as 1.0.6.'
}
if (Test-Path -LiteralPath $releaseApk) {
    throw "Release APK already exists and will not be overwritten: $releaseApk"
}
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Android manifest not found: $manifestPath"
}
if (-not (Test-Path -LiteralPath $appGradlePath)) {
    throw "Android app Gradle file not found: $appGradlePath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw
if ($manifest -notmatch '(?s)<activity\b(?=[^>]*android:name="\.MainActivity")(?=[^>]*android:screenOrientation="portrait")') {
    throw 'MainActivity must declare android:screenOrientation="portrait" before packaging.'
}
$appGradle = Get-Content -LiteralPath $appGradlePath -Raw
if ($appGradle -notmatch "(?m)^\s*versionName\s+`"$([regex]::Escape($versionName))`"") {
    throw "Android versionName must match package.json version $versionName."
}

$androidSdk = if ($env:ANDROID_HOME) {
    $env:ANDROID_HOME
} elseif ($env:ANDROID_SDK_ROOT) {
    $env:ANDROID_SDK_ROOT
} else {
    Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}

$javaHomes = @(@(
        $env:STUDYSTUDIO_JAVA_HOME,
        $env:JAVA_HOME,
        'D:\HMCL\Java\java21',
        'C:\Program Files\Android\Android Studio\jbr'
    ) | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'bin\java.exe')) } | Select-Object -Unique)

if (-not (Test-Path -LiteralPath $androidSdk)) {
    throw 'Android SDK not found. Set ANDROID_HOME before running this script.'
}
if (-not $javaHomes) {
    throw 'JDK 21 not found. Set STUDYSTUDIO_JAVA_HOME or JAVA_HOME to a JDK 21 installation.'
}

$env:JAVA_HOME = $javaHomes[0]
$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk

Push-Location $projectRoot
try {
    & npm run android:assets
    if ($LASTEXITCODE -ne 0) {
        throw "Android asset generation failed with exit code $LASTEXITCODE."
    }

    & npm run android:sync
    if ($LASTEXITCODE -ne 0) {
        throw "Capacitor sync failed with exit code $LASTEXITCODE."
    }

    Push-Location $androidRoot
    try {
        $buildSucceeded = $false
        for ($attempt = 1; $attempt -le 4; $attempt++) {
            $previousErrorActionPreference = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            try {
                $buildOutput = @(.\gradlew.bat :app:assembleDebug --console=plain --no-daemon 2>&1)
                $buildExitCode = $LASTEXITCODE
            }
            finally {
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
        if (-not $buildSucceeded) {
            throw 'Android build did not complete.'
        }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path -LiteralPath $sourceApk)) {
        throw "Built APK not found: $sourceApk"
    }
    New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
    Copy-Item -LiteralPath $sourceApk -Destination $releaseApk

    $artifact = Get-Item -LiteralPath $releaseApk
    $hash = Get-FileHash -LiteralPath $releaseApk -Algorithm SHA256
    Write-Output "APK_PATH=$($artifact.FullName)"
    Write-Output "APK_SIZE_BYTES=$($artifact.Length)"
    Write-Output "APK_SHA256=$($hash.Hash)"
}
finally {
    Pop-Location
}
