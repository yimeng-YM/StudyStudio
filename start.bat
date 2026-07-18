@echo off
setlocal
title StudyStudio Frontend
cd /d "%~dp0"

echo ================================================
echo              StudyStudio Launcher
echo ================================================
echo.

echo [1/3] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install the current LTS release first:
  echo https://nodejs.org/
  pause
  exit /b 1
)

echo [2/3] Checking frontend dependencies...
if not exist "node_modules" (
  call npm install
  if errorlevel 1 (
    echo Frontend dependency installation failed.
    pause
    exit /b 1
  )
)

echo [3/3] Starting StudyStudio on http://localhost:5173 ...
if /i not "%STUDYSTUDIO_SKIP_SEARCH%"=="1" (
  powershell.exe -NoLogo -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:17890/api/health' -TimeoutSec 2; if ($r.gateway) { exit 0 } } catch {}; exit 1" >nul 2>&1
  if errorlevel 1 (
    echo Opening the search service in a separate window...
    start "StudyStudio Search Service" "%ComSpec%" /d /c call "%~dp0start-search.bat"
  ) else (
    echo The search service is already running.
  )
)

start "" /b cmd.exe /d /c "timeout /t 3 >nul && start http://localhost:5173"
echo.
echo Keep this window open while using the frontend.
echo The search service runs independently in its own window.
echo.

call npm run dev
set "frontend_exit=%ERRORLEVEL%"
if not "%frontend_exit%"=="0" (
  echo.
  echo The StudyStudio frontend stopped with exit code %frontend_exit%.
  pause
)
exit /b %frontend_exit%
