param(
    [string]$VersionName = '1.0.6',
    [int]$VersionCode = 7
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot 'android'
$gradleWrapper = Join-Path $androidRoot 'gradlew.bat'
$manifestPath = Join-Path $androidRoot 'app\src\main\AndroidManifest.xml'
$appGradlePath = Join-Path $androidRoot 'app\build.gradle'
$sourceApk = Join-Path $androidRoot 'app\build\outputs\apk\debug\app-debug.apk'
$releaseRoot = Join-Path $projectRoot 'release'
$releaseApk = Join-Path $releaseRoot "StudyStudio-v$VersionName-debug.apk"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if ($VersionCode -lt 1) {
    throw 'VersionCode must be a positive integer.'
}
if ($VersionName -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
    throw 'VersionName must be a semantic version such as 1.0.6.'
}
if (Test-Path -LiteralPath $releaseApk) {
    throw "Release APK already exists and will not be overwritten: $releaseApk"
}

function Get-JavaMajorVersion([string]$JavaExecutable) {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $versionOutput = (& $JavaExecutable -version 2>&1 | Out-String)
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($versionOutput -match 'version\s+"(?<major>\d+)') {
        return [int]$Matches.major
    }
    return $null
}

$javaCandidates = @()
if ($env:STUDYSTUDIO_JAVA_HOME) {
    $javaCandidates += Join-Path $env:STUDYSTUDIO_JAVA_HOME 'bin\java.exe'
}
if ($env:JAVA_HOME) {
    $javaCandidates += Join-Path $env:JAVA_HOME 'bin\java.exe'
}
$javaCandidates += @(
    (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr\bin\java.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\jbr\bin\java.exe')
)
$whereJava = & where.exe java 2>$null
if ($LASTEXITCODE -eq 0) {
    $javaCandidates += $whereJava
}

$jdk21Executable = $javaCandidates |
    Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
    Select-Object -Unique |
    Where-Object { (Get-JavaMajorVersion $_) -eq 21 } |
    Select-Object -First 1
if (-not $jdk21Executable) {
    throw 'JDK 21 is required. Install it or set STUDYSTUDIO_JAVA_HOME to the JDK 21 directory.'
}
$env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $jdk21Executable)
$env:Path = "$(Split-Path -Parent $jdk21Executable);$env:Path"

Push-Location $projectRoot
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Web build failed (exit code $LASTEXITCODE)."
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $gradleWrapper)) {
    if (Test-Path -LiteralPath $androidRoot) {
        throw "The Android directory exists but is incomplete. Remove or move '$androidRoot', then run this command again."
    }

    Push-Location $projectRoot
    try {
        & npx cap add android
        if ($LASTEXITCODE -ne 0) {
            throw "Capacitor failed to create the Android project (exit code $LASTEXITCODE)."
        }
    }
    finally {
        Pop-Location
    }
}

Push-Location $projectRoot
try {
    & npx cap sync android
    if ($LASTEXITCODE -ne 0) {
        throw "Capacitor sync failed (exit code $LASTEXITCODE)."
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Android manifest not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw
$mainActivityPattern = '(?s)(<activity\b(?=[^>]*android:name="\.MainActivity")[^>]*)(>)'
$mainActivityMatch = [regex]::Match($manifest, $mainActivityPattern)
if (-not $mainActivityMatch.Success) {
    throw 'MainActivity was not found in AndroidManifest.xml.'
}

$activityTag = $mainActivityMatch.Groups[1].Value
if ($activityTag -match 'android:screenOrientation\s*=') {
    $activityTag = [regex]::Replace(
        $activityTag,
        'android:screenOrientation\s*=\s*"[^"]*"',
        'android:screenOrientation="portrait"'
    )
}
else {
    $activityTag += "`r`n            android:screenOrientation=`"portrait`""
}
$manifest = $manifest.Substring(0, $mainActivityMatch.Index) +
    $activityTag + $mainActivityMatch.Groups[2].Value +
    $manifest.Substring($mainActivityMatch.Index + $mainActivityMatch.Length)
[System.IO.File]::WriteAllText($manifestPath, $manifest, $utf8NoBom)

if (-not (Test-Path -LiteralPath $appGradlePath)) {
    throw "Android app Gradle file not found: $appGradlePath"
}

$appGradle = Get-Content -LiteralPath $appGradlePath -Raw
if ($appGradle -notmatch '(?m)^\s*versionCode\s+\d+' -or
    $appGradle -notmatch '(?m)^\s*versionName\s+"[^"]+"') {
    throw 'versionCode or versionName was not found in app/build.gradle.'
}
$appGradle = [regex]::Replace(
    $appGradle,
    '(?m)^(\s*)versionCode\s+\d+',
    "`${1}versionCode $VersionCode"
)
$appGradle = [regex]::Replace(
    $appGradle,
    '(?m)^(\s*)versionName\s+"[^"]+"',
    "`${1}versionName `"$VersionName`""
)
[System.IO.File]::WriteAllText($appGradlePath, $appGradle, $utf8NoBom)

Push-Location $androidRoot
try {
    & $gradleWrapper assembleDebug
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle build failed (exit code $LASTEXITCODE)."
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

$releaseFile = Get-Item -LiteralPath $releaseApk
$hash = Get-FileHash -LiteralPath $releaseApk -Algorithm SHA256
Write-Output "APK_PATH=$($releaseFile.FullName)"
Write-Output "APK_SIZE_BYTES=$($releaseFile.Length)"
Write-Output "APK_SHA256=$($hash.Hash)"
