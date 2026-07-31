@echo off
setlocal
chcp 65001 >nul
set "STUDYSTUDIO_LEGACY_ENTRY=1"
call "%~dp0start-search.bat" %*
set "search_exit=%ERRORLEVEL%"
exit /b %search_exit%
