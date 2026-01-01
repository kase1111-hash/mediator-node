@echo off
REM ============================================================================
REM NatLangChain Mediator Node - Build Script for Windows
REM Version: 0.1.0-alpha
REM ============================================================================

echo.
echo ========================================
echo  NatLangChain Mediator Node Builder
echo  Version 0.1.0-alpha
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

REM Check Node.js version
for /f "tokens=1" %%v in ('node -v') do set NODE_VERSION=%%v
echo [INFO] Node.js version: %NODE_VERSION%

REM Check if npm is available
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed or not in PATH.
    pause
    exit /b 1
)

echo.
echo [STEP 1/4] Installing dependencies...
echo ----------------------------------------
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)
echo [OK] Dependencies installed.

echo.
echo [STEP 2/4] Building TypeScript...
echo ----------------------------------------
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
echo [OK] Build completed.

echo.
echo [STEP 3/4] Checking configuration...
echo ----------------------------------------
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Creating .env from .env.example...
        copy .env.example .env >nul
        echo [WARN] Please edit .env with your API keys and settings.
    ) else (
        echo [WARN] No .env.example found. Run 'npm run init' to create config.
    )
) else (
    echo [OK] Configuration file exists.
)

echo.
echo [STEP 4/4] Verifying build...
echo ----------------------------------------
if exist "dist\cli.js" (
    echo [OK] Build artifacts verified.
) else (
    echo [ERROR] Build artifacts not found.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  BUILD SUCCESSFUL!
echo ========================================
echo.
echo Next steps:
echo   1. Edit .env with your API keys
echo   2. Run 'run.bat' to start the mediator
echo   3. Or run 'npm run mock-chain' for testing
echo.
pause
