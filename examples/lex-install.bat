@echo off
setlocal enabledelayedexpansion

:: 设置文件路径
set "SOURCE=%~dp0ChsWubi.lex"
set "DEST_ORIG=C:\Windows\InputMethod\CHS\ChsWubi.lex"
set "DEST_NEW=C:\Windows\InputMethod\CHS\ChsWubiNew.lex"
set "BACKUP_ORIG=%DEST_ORIG%.bak"
set "SERVICE_NAME=TabletInputService"

set "SOURCE2=%~dp0ChsWubiEUDPv1.lex"
set "DEST21=%USERPROFILE%\AppData\Roaming\Microsoft\InputMethod\Chs\ChsWubiEUDPv1.lex"
set "DEST22=%USERPROFILE%\AppData\Roaming\Microsoft\InputMethod\Chs\ChsWubiEUDPv2.lex"

:: 获取管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell start -verb runas '%0'
    exit /b
)

title 微软五笔词库替换工具

:: 检查源文件是否存在
if not exist "%SOURCE%" (
    echo 错误：找不到文件 "%SOURCE%"
    pause
    exit /b 1
)

echo ==============================================
echo  微软五笔词库替换工具
echo ==============================================
echo 正在复制用户词库到 %DEST21%
echo 正在复制用户词库到 %DEST22%

:: check & copy user dict
if not exist "%SOURCE2%" (
    echo 错误：找不到文件 "%SOURCE2%"
    pause
    exit /b 1
)
if exist "%DEST21" (
    copy /y "%DEST21%" "%DEST21%.bak"
)
copy /y "%SOURCE2%" "%DEST21%" >nul
copy /y "%SOURCE2%" "%DEST22%" >nul

:: 备份原始目标文件（如果存在）
if exist "%DEST_ORIG%" (
    echo 正在备份词库到 %BACKUP_ORIG%
    copy /y "%DEST_ORIG%" "%BACKUP_ORIG%" >nul
    if %errorlevel% neq 0 (
        echo 备份失败，请检查权限。
        pause
        exit /b 1
    )
)

:: 停止 TabletInputService 服务（如果正在运行）
sc query "%SERVICE_NAME%" | find "RUNNING" >nul
if %errorlevel% equ 0 (
    echo 正在停止服务 %SERVICE_NAME%...
    net stop "%SERVICE_NAME%" >nul
    if %errorlevel% equ 0 (
        set SERVICE_STOPPED=1
        echo 服务已停止。
    ) else (
        echo 警告：无法停止服务 %SERVICE_NAME%，可能已被禁用或不存在。
        set SERVICE_STOPPED=0
    )
) else (
    set SERVICE_STOPPED=0
)

:: 杀死可能占用词库文件的进程
echo 正在终止输入法相关进程...
taskkill /f /im ctfmon.exe >nul 2>&1
taskkill /f /im ChsIME.exe >nul 2>&1
taskkill /f /im TabTip.exe >nul 2>&1
taskkill /f /im InputApp.exe >nul 2>&1
taskkill /f /im TextInputHost.exe >nul 2>&1

:: 获取两个目标文件的所有权并授予完全控制权限
echo 正在获取文件权限...
for %%F in ("%DEST_ORIG%" "%DEST_NEW%") do (
    if exist %%F (
        takeown /f %%F >nul 2>&1
        icacls %%F /grant administrators:F >nul 2>&1
    )
)

:: 复制到原始目标文件
echo 正在复制新词库到 %DEST_ORIG%...
copy /y "%SOURCE%" "%DEST_ORIG%" >nul
if %errorlevel% equ 0 (
    set COPY_ORIG_SUCCESS=1
) else (
    echo 错误：复制到原始目标失败，可能文件仍被占用或权限不足。
    set COPY_ORIG_SUCCESS=0
)

:: 复制到新的目标文件 ChsWubiNew.lex
echo 正在复制新词库到 %DEST_NEW%...
copy /y "%SOURCE%" "%DEST_NEW%" >nul
if %errorlevel% equ 0 (
    set COPY_NEW_SUCCESS=1
) else (
    echo 错误：复制到新目标失败，请检查路径权限。
    set COPY_NEW_SUCCESS=0
)

:: 恢复之前停止的服务
if "!SERVICE_STOPPED!"=="1" (
    echo 正在恢复服务 %SERVICE_NAME%...
    net start "%SERVICE_NAME%" >nul
    if %errorlevel% equ 0 (
        echo 服务已重新启动。
    ) else (
        echo 警告：服务启动失败。
    )
) else (
    echo 无需恢复服务。
)

:: 总结
echo.
echo ==============================================
if "!COPY_ORIG_SUCCESS!"=="1" if "!COPY_NEW_SUCCESS!"=="1" (
    echo 全部操作成功！
) else (
    echo 部分操作失败，请检查上述错误信息。
)
echo 若词库未生效，可以尝试注销或重启电脑。
echo ==============================================
pause >nul
exit /b
