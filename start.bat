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

if defined STUDYSTUDIO_SEARCH_BRIDGED goto search_banner_done
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
:search_banner_done

powershell.exe -NoLogo -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:17890/api/health' -TimeoutSec 2; if ($r.gateway -and $r.status -eq 'ok') { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 (
  echo %c_green%本地搜索服务已在运行：http://127.0.0.1:17890/api%c_reset%
  echo %c_yell%无需重复启动，按任意键关闭此窗口。%c_reset%
  pause >nul
  exit /b 0
)

echo %c_cyan%正在启动独立的本地搜索服务...%c_reset%
echo %c_yell%首次启动可能需要安装依赖或拉取 Docker 镜像，请耐心等待。%c_reset%
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set "search_exit=%ERRORLEVEL%"

if not "%search_exit%"=="0" (
  echo.
  echo %c_red%[错误] 搜索服务启动失败，请查看上方日志。%c_reset%
  echo %c_red%退出代码：%search_exit%%c_reset%
  echo.
  pause
  exit /b %search_exit%
)

echo.
echo %c_green%搜索服务已就绪。%c_reset%
echo %c_yell%按任意键关闭此启动窗口；正在运行的搜索服务不会受到影响。%c_reset%
pause >nul
exit /b 0
