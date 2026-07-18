@echo off
setlocal
title StudyStudio Search Service
cd /d "%~dp0"

echo Starting the independent StudyStudio search service...
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1" %*
set "search_exit=%ERRORLEVEL%"

if not "%search_exit%"=="0" (
  echo.
  echo The search service failed to start. Review the error above.
  echo Exit code: %search_exit%
  echo.
  pause
  exit /b %search_exit%
)

echo.
echo The search service has stopped.
pause
exit /b 0
