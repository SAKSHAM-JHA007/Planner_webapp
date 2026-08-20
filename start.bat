@echo off
setlocal

:: Ensure Node.js and npm are in PATH
set "PATH=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;%PATH%"

cd /d "%~dp0"

:: Check if node is accessible
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found. Please ensure Node.js is installed.
    pause
    exit /b 1
)

:: Check and install dependencies if node_modules is missing
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

echo Starting Planner App Server...
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"
echo Server is running on http://localhost:3000
echo Press Ctrl+C to stop the server.
node server.js
pause
