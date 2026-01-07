@echo off
setlocal
chcp 65001 >nul
title StudyStudio Launcher
for /F %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "c_cyan=%ESC%[96m"
set "c_blue=%ESC%[94m"
set "c_purp=%ESC%[95m"
set "c_green=%ESC%[92m"
set "c_yell=%ESC%[93m"
set "c_red=%ESC%[91m"
set "c_reset=%ESC%[0m"

cls
echo.
echo %c_cyan%   _____ __            __      _____ __            __              %c_reset%
echo %c_cyan%  / ___// /___  ______/ /_  __/ ___// /___  ______/ /()___  %c_reset%
echo %c_blue%  \__ \/ __/ / / / __  / / / /\__ \/ __/ / / / __  / / __ \ %c_reset%
echo %c_purp% ___/ / /_/ /_/ / /_/ / /_/ /___/ / /_/ /_/ / /_/ / / /_/ / %c_reset%
echo %c_purp%/____/\__/\__,_/\__,_/\__, //____/\__/\__,_/\__,_/_/\____/  %c_reset%
echo %c_purp%                     /____/                                 %c_reset%
echo.
echo %c_blue%====================================================%c_reset%
echo        %c_purp%欢迎使用 StudyStudio 自动启动程序%c_reset%
echo %c_blue%====================================================%c_reset%
echo.

echo %c_cyan%[1/3] 正在检查 Node.js 环境...%c_reset%
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo %c_yell%[警告] 未检测到 Node.js！%c_reset%
    echo %c_yell%正在尝试使用 winget 自动安装 LTS 版本...%c_reset%
    echo.
    winget install -e --id OpenJS.NodeJS.LTS
    if %errorlevel% neq 0 (
        echo.
        echo %c_yell%[注意] 自动安装过程已结束。%c_reset%
        echo %c_yell%如果上方提示 "Successfully installed" 或 "安装成功"，%c_reset%
        echo %c_green%请直接关闭此窗口并重新运行 start.bat 即可。%c_reset%
        echo.
        echo %c_red%如果上方提示安装失败，请按任意键打开手动下载页面...%c_reset%
        pause
        start https://nodejs.org/
        exit /b
    )
    echo.
    echo %c_green%Node.js 安装完成！请重启脚本以生效。%c_reset%
    echo %c_yell%[注意：如果不生效，可能需要重启电脑或重新打开终端]%c_reset%
    pause
    exit /b
) else (
    echo %c_green%Node.js 已安装。%c_reset%
)
echo.

echo %c_cyan%[2/3] 正在检查项目依赖...%c_reset%
if not exist "node_modules" (
    echo %c_yell%未发现项目依赖，正在首次安装... [这可能需要几分钟]%c_reset%
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo %c_red%[错误] 依赖安装失败！请检查网络或配置。%c_reset%
        pause
        exit /b
    )
    echo %c_green%依赖安装成功！%c_reset%
) else (
    echo %c_green%依赖已就绪。%c_reset%
)
echo.

echo %c_cyan%[3/3] 正在启动 StudyStudio...%c_reset%
echo %c_yell%网页将在 5 秒后自动打开...%c_reset%

start "" /b cmd /c "timeout /t 5 >nul && start http://localhost:5173"

echo.
echo %c_blue%====================================================%c_reset%
echo        %c_green%StudyStudio 已启动！%c_reset%
echo        %c_purp%请在弹出的网页中继续操作。%c_reset%
echo        %c_purp%关闭此窗口即可停止服务。%c_reset%
echo %c_blue%====================================================%c_reset%
echo.

npm run dev
