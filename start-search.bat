@echo off
setlocal
chcp 65001 >nul
title StudyStudio 本地搜索服务
cd /d "%~dp0"

for /F %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "c_cyan=%ESC%[96m"
set "c_blue=%ESC%[94m"
set "c_purp=%ESC%[95m"
set "c_green=%ESC%[92m"
set "c_yell=%ESC%[93m"
set "c_red=%ESC%[91m"
set "c_reset=%ESC%[0m"

cls
echo %c_cyan%   _____ __            __      _____ __            __              %c_reset%
echo %c_cyan%  / ___// /___  ______/ /_  __/ ___// /___  ______/ /()___  %c_reset%
echo %c_blue%  \__ \/ __/ / / / __  / / / /\__ \/ __/ / / / __  / / __ \ %c_reset%
echo %c_purp% ___/ / /_/ /_/ / /_/ / /_/ /___/ / /_/ /_/ / /_/ / / /_/ / %c_reset%
echo %c_purp%/____/\__/\__,_/\__,_/\__, //____/\__/\__,_/\__,_/_/\____/  %c_reset%
echo %c_purp%                     /____/                                 %c_reset%
echo.
echo %c_blue%============================================================%c_reset%
echo %c_cyan%                 StudyStudio 本地搜索服务%c_reset%
echo %c_blue%============================================================%c_reset%
echo.

if defined STUDYSTUDIO_LEGACY_ENTRY (
  echo %c_yell%提示：start-local.bat 是兼容入口，后续请使用 start-search.bat。%c_reset%
  echo.
)

if not exist "%~dp0search\start.bat" (
  echo %c_red%[错误] 尚未安装独立搜索服务。%c_reset%
  echo.
  echo %c_yell%请先在当前目录执行以下命令检出 search 分支：%c_reset%
  echo %c_cyan%git clone --branch search --single-branch https://github.com/yimeng-YM/StudyStudio.git search%c_reset%
  echo.
  pause
  exit /b 1
)

if not defined LOCAL_SEARCH_ADDITIONAL_ORIGINS (
  set "LOCAL_SEARCH_ADDITIONAL_ORIGINS=https://mengstudystudio.cn,https://www.mengstudystudio.cn"
)

echo %c_green%已找到独立 search 分支。%c_reset%
echo %c_cyan%正在转交搜索服务启动流程...%c_reset%
echo.

set "STUDYSTUDIO_SEARCH_BRIDGED=1"
call "%~dp0search\start.bat" %*
set "search_exit=%ERRORLEVEL%"
exit /b %search_exit%
