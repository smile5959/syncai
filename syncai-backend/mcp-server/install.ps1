# ============================================================
# SyncAI MCP Server Installer — Windows (PowerShell)
# ============================================================
#
# 사용법 (프론트에서 생성된 명령어):
#   powershell -ExecutionPolicy Bypass -Command "& {$(irm 'URL')} -Token TOKEN"
#
# 설치 위치:
#   %APPDATA%\SyncAI\
#
# 서비스 관리 (Task Scheduler):
#   시작:  schtasks /Run /TN "SyncAI MCP"
#   중지:  schtasks /End /TN "SyncAI MCP"
#   로그:  notepad "$env:APPDATA\SyncAI\logs\server.log"
# ============================================================

param(
    [string]$Token = "",
    [string]$BaseDir = ""
)

# UTF-8 인코딩 설정 (한글 깨짐 방지)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Stop"

$BACKEND_URL = "https://syncai-backend.fly.dev"
$APP_DIR     = "$env:APPDATA\SyncAI"
$LOG_DIR     = "$APP_DIR\logs"
$VENV_DIR    = "$APP_DIR\venv"
$CODE_DIR    = "$APP_DIR\code"
$ENV_FILE    = "$APP_DIR\.env"
$TASK_NAME   = "SyncAI MCP"

function Write-Step($msg) { Write-Host "  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  [오류] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "┌─────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "│   SyncAI MCP Server 설치 중...      │" -ForegroundColor Cyan
Write-Host "└─────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""

# ── 토큰 확인 ─────────────────────────────────────────────────────────────────
if (-not $Token) {
    Write-Fail "--Token 인자가 필요합니다."
    Write-Host ""
    Write-Host "SyncAI 웹앱 → MCP 설정 → 설치 명령어를 복사해서 실행해주세요."
    exit 1
}

# ── Python 3.10+ 확인 ─────────────────────────────────────────────────────────
$PYTHON = $null
foreach ($candidate in @("python", "python3", "py")) {
    try {
        $ver = & $candidate -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        if ($ver -match "^(\d+)\.(\d+)") {
            $maj = [int]$Matches[1]; $min = [int]$Matches[2]
            if ($maj -ge 3 -and $min -ge 10) { $PYTHON = $candidate; break }
        }
    } catch {}
}

if (-not $PYTHON) {
    Write-Warn "Python 3.10 이상이 없습니다. 자동 설치 시도 중..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
        # PATH 갱신
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        foreach ($candidate in @("python", "py")) {
            try {
                $ver = & $candidate -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
                if ($ver -match "^(\d+)\.(\d+)") {
                    $maj = [int]$Matches[1]; $min = [int]$Matches[2]
                    if ($maj -ge 3 -and $min -ge 10) { $PYTHON = $candidate; break }
                }
            } catch {}
        }
    }
    if (-not $PYTHON) {
        Write-Fail "Python 설치 실패. 아래 주소에서 직접 설치 후 다시 실행해주세요:"
        Write-Host "  https://www.python.org/downloads/"
        exit 1
    }
    Write-Step "Python 설치 완료"
}

$verStr = & $PYTHON -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
Write-Step "Python $verStr 확인"

# ── 디렉터리 생성 ─────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $APP_DIR  | Out-Null
New-Item -ItemType Directory -Force -Path $LOG_DIR  | Out-Null
New-Item -ItemType Directory -Force -Path $CODE_DIR | Out-Null

# ── 서버 코드 다운로드 ────────────────────────────────────────────────────────
Write-Host "  서버 코드 다운로드 중..."
try {
    $versionJson  = Invoke-RestMethod -Uri "$BACKEND_URL/v1/mcp-version" -ErrorAction Stop
    $downloadUrl  = $versionJson.download_url
    if ($downloadUrl) {
        $tmpZip = [System.IO.Path]::GetTempFileName() + ".zip"
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tmpZip -UseBasicParsing
        Expand-Archive -Path $tmpZip -DestinationPath $CODE_DIR -Force
        Remove-Item $tmpZip -Force
        Write-Step "서버 코드 설치 완료"
    } else {
        Write-Warn "다운로드 URL 없음 — 기존 코드 유지"
    }
} catch {
    Write-Warn "코드 다운로드 실패 — 기존 코드 유지: $_"
}

if (-not (Test-Path "$CODE_DIR\server.py")) {
    Write-Fail "server.py가 없습니다. 네트워크를 확인 후 다시 실행해주세요."
    exit 1
}

# ── bootstrap.py 다운로드 ─────────────────────────────────────────────────────
try {
    $bootstrapUrl = "https://raw.githubusercontent.com/smile5959/syncai/main/syncai-backend/mcp-server/bootstrap.py"
    Invoke-WebRequest -Uri $bootstrapUrl -OutFile "$APP_DIR\bootstrap.py" -UseBasicParsing
    Write-Step "bootstrap.py 설치 완료"
} catch {
    if (Test-Path "$CODE_DIR\bootstrap.py") {
        Copy-Item "$CODE_DIR\bootstrap.py" "$APP_DIR\bootstrap.py" -Force
    }
}

# ── Python 가상환경 + 의존성 설치 ────────────────────────────────────────────
Write-Host "  Python 환경 설정 중..."
if (-not (Test-Path "$VENV_DIR\Scripts\python.exe")) {
    & $PYTHON -m venv $VENV_DIR
}
$VENV_PY  = "$VENV_DIR\Scripts\python.exe"
$VENV_PIP = "$VENV_DIR\Scripts\pip.exe"

& $VENV_PIP install -q --upgrade pip
$reqFile = "$CODE_DIR\requirements.txt"
if (Test-Path $reqFile) {
    & $VENV_PIP install -q -r $reqFile
}
Write-Step "Python 환경 준비 완료"

# ── .env 작성 ─────────────────────────────────────────────────────────────────
$envContent = "SYNCAI_BACKEND_URL=$BACKEND_URL`r`nMCP_AUTH_TOKEN=$Token`r`n"
if ($BaseDir) { $envContent += "MCP_BASE_DIR=$BaseDir`r`n" }
Set-Content -Path $ENV_FILE -Value $envContent -Encoding UTF8
Write-Step "설정 파일 생성"

# ── Task Scheduler 등록 ───────────────────────────────────────────────────────
# 기존 태스크 삭제
schtasks /Delete /TN $TASK_NAME /F 2>$null | Out-Null

$action  = New-ScheduledTaskAction `
    -Execute $VENV_PY `
    -Argument "`"$APP_DIR\bootstrap.py`"" `
    -WorkingDirectory $APP_DIR

$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

$env_vars = @{
    SYNCAI_GITHUB_REPO = "smile5959/syncai"
    APPDATA            = $env:APPDATA
    USERPROFILE        = $env:USERPROFILE
    HOME               = $env:USERPROFILE
}
# 환경변수를 bootstrap.py가 읽을 수 있도록 .env에 이미 저장돼있음

Register-ScheduledTask `
    -TaskName  $TASK_NAME `
    -Action    $action `
    -Trigger   $trigger `
    -Settings  $settings `
    -RunLevel  Limited `
    -Force | Out-Null

Write-Step "Task Scheduler 등록 완료"

# ── 서비스 시작 ───────────────────────────────────────────────────────────────
schtasks /Run /TN $TASK_NAME 2>$null | Out-Null
Write-Step "서비스 시작"

# ── 완료 ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "🎉 SyncAI MCP 설치 완료!" -ForegroundColor Green
Write-Host ""
Write-Host "MCP 서버가 백그라운드에서 실행 중입니다."
Write-Host "SyncAI 웹앱에서 자동으로 '온라인' 상태로 표시됩니다."
Write-Host ""
Write-Host "유용한 명령어:" -ForegroundColor Cyan
Write-Host "  로그 보기:    Get-Content `"$LOG_DIR\server.log`" -Wait"
Write-Host "  서비스 중지:  schtasks /End /TN `"$TASK_NAME`""
Write-Host "  서비스 시작:  schtasks /Run /TN `"$TASK_NAME`""
Write-Host "  제거:         schtasks /Delete /TN `"$TASK_NAME`" /F"
Write-Host ""
