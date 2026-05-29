@echo off
chcp 65001 >nul
echo.
echo  SyncAI MCP Server
echo  ==========================================

:: .env 파일 없으면 예시 파일 복사
if not exist .env (
    echo  [*] Creating .env from template...
    copy .env.example .env >nul
    echo  [!] Set MCP_AUTH_TOKEN in .env, then restart.
    pause
    exit /b
)

:: 가상환경 없으면 생성
if not exist venv (
    echo  [*] Creating virtual environment...
    python -m venv venv
)

:: 가상환경 활성화 및 패키지 설치
call venv\Scripts\activate.bat
pip install -r requirements.txt -q

echo.
echo  [*] Starting MCP server (WebSocket mode)...
echo.

:: Stop SyncAIMCPServer service if running
sc query SyncAIMCPServer >nul 2>&1
if %errorlevel% == 0 (
    echo  [*] Stopping SyncAIMCPServer service...
    sc stop SyncAIMCPServer >nul 2>&1
)

:: Kill any process on port 7860
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":7860 " ^| findstr "LISTENING"') do (
    echo  [*] Killing PID %%a on port 7860...
    taskkill /F /PID %%a >nul 2>&1
)

:: Wait 2 seconds
timeout /t 2 /nobreak >nul

python server.py

pause
