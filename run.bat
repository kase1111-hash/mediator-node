@echo off
REM ============================================================================
REM NatLangChain Mediator Node - Run Script for Windows
REM Version: 0.1.0-alpha
REM ============================================================================

echo.
echo ========================================
echo  NatLangChain Mediator Node
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

REM Check if build exists
if not exist "dist\cli.js" (
    echo [ERROR] Build not found. Please run build.bat first.
    echo.
    set /p DOBUILD="Would you like to build now? (Y/N): "
    if /i "%DOBUILD%"=="Y" (
        call build.bat
        if %ERRORLEVEL% neq 0 exit /b 1
    ) else (
        pause
        exit /b 1
    )
)

REM Check if .env exists
if not exist ".env" (
    echo [WARN] No .env configuration file found.
    if exist ".env.example" (
        echo [INFO] Creating .env from .env.example...
        copy .env.example .env >nul
        echo.
        echo [IMPORTANT] Please edit .env with your settings before continuing.
        echo Required settings:
        echo   - ANTHROPIC_API_KEY or OPENAI_API_KEY
        echo   - CHAIN_ENDPOINT (or use mock chain)
        echo.
        pause
        exit /b 1
    )
)

REM Parse command line arguments
set MODE=start
set EXTRA_ARGS=

if "%1"=="--help" goto :show_help
if "%1"=="-h" goto :show_help
if "%1"=="help" goto :show_help
if "%1"=="status" set MODE=status
if "%1"=="init" set MODE=init
if "%1"=="mock" goto :run_mock
if "%1"=="dev" goto :run_dev

REM Show current configuration
echo [INFO] Loading configuration...
echo.

REM Start the mediator node
echo [INFO] Starting Mediator Node in %MODE% mode...
echo ----------------------------------------
echo.

if "%MODE%"=="status" (
    node dist\cli.js status %EXTRA_ARGS%
) else if "%MODE%"=="init" (
    node dist\cli.js init %EXTRA_ARGS%
) else (
    node dist\cli.js start %EXTRA_ARGS%
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Mediator node exited with error code %ERRORLEVEL%
    pause
)
goto :eof

:run_mock
echo [INFO] Starting Mock Chain Server...
echo ----------------------------------------
echo.
cd examples\mock-chain
if not exist "node_modules" (
    echo [INFO] Installing mock chain dependencies...
    call npm install
)
call npm start
cd ..\..
goto :eof

:run_dev
echo [INFO] Starting in Development Mode (with hot reload)...
echo ----------------------------------------
echo.
call npm run dev
goto :eof

:show_help
echo.
echo Usage: run.bat [command]
echo.
echo Commands:
echo   (none)    Start the mediator node
echo   status    Check mediator node status
echo   init      Initialize configuration
echo   mock      Start the mock chain server
echo   dev       Start in development mode (hot reload)
echo   help      Show this help message
echo.
echo Examples:
echo   run.bat           - Start mediator node
echo   run.bat status    - Check status
echo   run.bat mock      - Start mock chain for testing
echo.
echo Configuration:
echo   Edit .env file to configure:
echo   - LLM provider and API keys
echo   - Chain endpoint
echo   - Consensus mode
echo   - Security apps (Boundary Daemon, SIEM)
echo.
pause
goto :eof
