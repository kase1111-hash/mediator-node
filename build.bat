@echo off
title NatLangChain Mediator Node - Build

echo ========================================
echo   NatLangChain Mediator Node Builder
echo ========================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

:: Show Node.js version
echo [INFO] Node.js version:
node --version
echo.

:: Install dependencies
echo [STEP 1/2] Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)
echo [OK] Dependencies installed.
echo.

:: Build the project
echo [STEP 2/2] Building project...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
echo [OK] Build complete.
echo.

echo ========================================
echo   Build successful!
echo ========================================
echo.
echo Next steps:
echo   1. Copy .env.example to .env and configure
echo   2. Run: npm start
echo.
pause
