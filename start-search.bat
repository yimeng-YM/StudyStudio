@echo off
setlocal
title StudyStudio Search Service
cd /d "%~dp0"

if not exist "%~dp0search\start.bat" (
  echo The independent search service is not installed.
  echo.
  echo Clone the search branch into this directory first:
  echo git clone --branch search --single-branch https://github.com/yimeng-YM/StudyStudio.git search
  echo.
  pause
  exit /b 1
)

if not defined LOCAL_SEARCH_ADDITIONAL_ORIGINS (
  set "LOCAL_SEARCH_ADDITIONAL_ORIGINS=https://mengstudystudio.cn,https://www.mengstudystudio.cn"
)

call "%~dp0search\start.bat" %*
exit /b %ERRORLEVEL%
