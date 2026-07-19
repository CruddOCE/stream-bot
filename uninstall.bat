@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   stream-bot uninstaller
echo ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
  ) else if exist "!ProgramFiles(x86)!\nodejs\node.exe" (
    set "PATH=!ProgramFiles(x86)!\nodejs;%PATH%"
  ) else (
    echo Node.js was not found on this computer.
    echo Nothing to uninstall via this script - if you installed the bot,
    echo you can just delete this folder yourself.
    pause
    exit /b 1
  )
)

node scripts\uninstall.js

echo.
pause
