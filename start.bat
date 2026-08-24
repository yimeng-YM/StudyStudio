@echo off
setlocal
chcp 65001 >nul
title StudyStudio Launcher
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
echo %c_cyan%              欢迎使用 StudyStudio 学习工作台%c_reset%
echo %c_blue%============================================================%c_reset%
echo.

echo %c_cyan%[1/3] 正在检查 Node.js 环境...%c_reset%
node --version >nul 2>&1
if errorlevel 1 (
  echo %c_red%[错误] 未检测到 Node.js。%c_reset%
  echo %c_yell%请先安装当前 LTS 版本：https://nodejs.org/%c_reset%
  pause
  exit /b 1
) else (
  echo %c_green%Node.js 已安装。%c_reset%
)
echo.

echo %c_cyan%[2/3] 正在检查前端依赖...%c_reset%
if not exist "node_modules" (
  echo %c_yell%未发现项目依赖，正在首次安装... [这可能需要几分钟]%c_reset%
  call npm install
  if errorlevel 1 (
    echo.
    echo %c_red%[错误] 前端依赖安装失败，请检查网络或 npm 配置。%c_reset%
    pause
    exit /b 1
  )
  echo %c_green%前端依赖安装成功。%c_reset%
) else (
  echo %c_green%前端依赖已就绪。%c_reset%
)
echo.

if not defined STUDYSTUDIO_DEV_PORT set "STUDYSTUDIO_DEV_PORT=5173"
set "STUDYSTUDIO_DEV_URL=http://127.0.0.1:%STUDYSTUDIO_DEV_PORT%"

echo %c_cyan%[3/3] 正在启动 StudyStudio...%c_reset%
if /i not "%STUDYSTUDIO_SKIP_SEARCH%"=="1" (
  if exist "%~dp0search\start.bat" (
    powershell.exe -NoLogo -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:17890/api/health' -TimeoutSec 2; if ($r.gateway -and $r.status -eq 'ok') { exit 0 } } catch {}; exit 1" >nul 2>&1
    if errorlevel 1 (
      echo %c_yell%正在单独窗口启动本地搜索服务...%c_reset%
      start "StudyStudio Search Service" "%ComSpec%" /d /c call "%~dp0start-search.bat"
    ) else (
      echo %c_green%本地搜索服务已在运行。%c_reset%
    )
  ) else (
    echo %c_yell%未在 search\ 目录中发现独立搜索分支。%c_reset%
    echo %c_yell%前端将继续启动，但不会自动启动本地搜索服务。%c_reset%
  )
) else (
  echo %c_yell%已按 STUDYSTUDIO_SKIP_SEARCH=1 跳过本地搜索服务。%c_reset%
)

if /i not "%STUDYSTUDIO_SKIP_BROWSER%"=="1" (
  start "" /b powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process '%STUDYSTUDIO_DEV_URL%'"
)
echo.
echo %c_blue%============================================================%c_reset%
echo %c_green%  StudyStudio 即将在 %STUDYSTUDIO_DEV_URL% 启动%c_reset%
echo %c_yell%  网页将在 3 秒后自动打开，请在使用期间保持此窗口运行。%c_reset%
echo %c_blue%============================================================%c_reset%
echo.

call npm run dev
set "frontend_exit=%ERRORLEVEL%"
echo.
if not "%frontend_exit%"=="0" (
  echo %c_red%StudyStudio 前端已停止，退出代码：%frontend_exit%。%c_reset%
) else (
  echo %c_yell%StudyStudio 前端进程已结束。%c_reset%
)
echo %c_yell%按任意键关闭此窗口，以便查看上方的运行信息。%c_reset%
pause >nul
exit /b %frontend_exit%
