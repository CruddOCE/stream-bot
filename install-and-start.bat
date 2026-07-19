@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   stream-bot installer / launcher
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
    echo Opening the download page - install it, then run this again.
    start "" "https://nodejs.org/"
    pause
    exit /b 1
  )
)

echo Installing dependencies, this can take a minute the first time...
call npm install
if %errorlevel% neq 0 (
  echo.
  echo npm install failed - see the errors above.
  pause
  exit /b 1
)

if not exist ".env" (
  echo.
  echo No .env found - running the setup wizard...
  call npm run setup
) else (
  echo.
  set "RECONFIG="
  set /p RECONFIG="A .env file already exists. Run the setup wizard again? (y/N): "
  if /i "!RECONFIG!"=="y" (
    call npm run setup
  )
)

echo.
echo Starting the bot... (press Ctrl+C to stop)
call npm start

echo.
pause
