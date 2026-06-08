; ============================================================
; SyncAI MCP Client Installer
; ============================================================
;
; 설치 화면 순서:
;   [1] 이용 동의
;   [2] 접근 폴더 선택 (커스텀 페이지)
;   [3] 설치 경로 선택
;   [4] 설치 실행 (파일 복사 + .env 생성 + 서비스 등록 + 시작)
;   [5] 완료
;
; 실행 방법:
;   SyncAI-MCP-Setup.exe /TOKEN=abc123
;   (웹앱 "다운로드" 버튼이 이 형태로 URL 생성)
;
; .env 생성 내용:
;   MCP_AUTH_TOKEN=<CLI /TOKEN 파라미터>
;   MCP_BASE_DIR=<선택한 폴더>  <- 일회성, WS 연결 후 ws_client.py가 삭제
;
; 연결 흐름:
;   서비스 시작 -> WS 연결 -> base_dir_update 전송 -> .env MCP_BASE_DIR 삭제
;   -> 이후 재시작 시 DB 경로 유지
; ============================================================

#define MyAppName      "SyncAI MCP Client"
#define MyAppVersion   "1.1.0"
#define MyAppPublisher "SyncAI"
#define MyAppURL       "https://syncai-backend.fly.dev"
#define MyAppExeName   "server\server.exe"

[Setup]
AppId={{A3F2C8D1-7E4B-4A5F-9C2E-1B8D3F6A0E7C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}

DefaultDirName={autopf}\SyncAI MCP Client
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes

PrivilegesRequired=admin

OutputDir=Output
OutputBaseFilename=SyncAI-MCP-Setup
Compression=lzma2/ultra64
SolidCompression=yes

; WizardImageFile=installer\wizard.bmp
; WizardSmallImageFile=installer\wizard-small.bmp
; SetupIconFile=installer\syncai.ico

MinVersion=10.0

UninstallDisplayIcon={app}\server\server.exe
UninstallDisplayName={#MyAppName}

; SignTool=signtool

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Files]
Source: "dist\server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "installer\syncai-mcp.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "syncai-mcp.xml"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\logs"

[Icons]
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\syncai-mcp.exe"; Parameters: "install"; \
  WorkingDir: "{app}"; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "SyncAI MCP 서비스 등록 중..."

Filename: "{app}\syncai-mcp.exe"; Parameters: "start"; \
  WorkingDir: "{app}"; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Starting SyncAI MCP service..."

[UninstallRun]
Filename: "{app}\syncai-mcp.exe"; Parameters: "stop"; \
  WorkingDir: "{app}"; \
  Flags: runhidden waituntilterminated; \
  RunOnceId: "StopService"

Filename: "{app}\syncai-mcp.exe"; Parameters: "uninstall"; \
  WorkingDir: "{app}"; \
  Flags: runhidden waituntilterminated; \
  RunOnceId: "UninstallService"

[Code]
{ ============================================================
  Pascal Script - OAuth PKCE flow
  1. Generate random state
  2. Run server.exe --setup-mode  (opens port 54321, waits for token)
  3. Open browser -> installer-auth URL
  4. Wait for server.exe to exit (it writes .env and exits)
  ============================================================ }

{ -- 전역 변수 ------------------------------------------ }
var
  FolderPage:      TWizardPage;
  FolderEdit:      TEdit;
  BrowseButton:    TButton;
  FolderHintLabel: TLabel;

  SavedBaseDir: String;
  OAuthDone:    Boolean;


{ -- 8자리 hex state 생성 --------------------------------- }
function GenerateState: String;
var
  I:   Integer;
  Hex: String;
begin
  Hex := '0123456789abcdef';
  Result := '';
  for I := 1 to 8 do
    Result := Result + Hex[Random(16) + 1];
end;


{ -- 폴더 선택 다이얼로그 ---------------------------------- }
procedure BrowseButtonClick(Sender: TObject);
var
  SelectedDir: String;
begin
  SelectedDir := '';
  if BrowseForFolder('AI가 접근할 폴더를 선택하세요.', SelectedDir, False) then
  begin
    FolderEdit.Text := SelectedDir;
    FolderHintLabel.Caption := 'Selected: ' + SelectedDir;
    FolderHintLabel.Font.Color := $008000;
  end;
end;


{ -- OAuth 플로우 실행 ------------------------------------- }
{ server.exe --setup-mode 가 .env 에 MCP_AUTH_TOKEN 을 저장 }
{ 이후 .env 에 MCP_BASE_DIR 만 추가 (append)                }
procedure RunOAuthFlow;
var
  State:      String;
  EnvPath:    String;
  BrowserURL: String;
  ResultCode: Integer;
  Elapsed:    Integer;
begin
  State   := GenerateState;
  EnvPath := ExpandConstant('{app}\server\.env');

  { 기존 .env 삭제 (이전 설치 잔여물) }
  if FileExists(EnvPath) then
    DeleteFile(EnvPath);

  { server.exe --setup-mode 백그라운드 실행 (포트 54321 대기) }
  Exec(
    ExpandConstant('{app}\server\server.exe'),
    '--setup-mode --state ' + State + ' --redirect http://localhost:54321',
    ExpandConstant('{app}\server'),
    SW_HIDE,
    ewNoWait,
    ResultCode
  );

  { PyInstaller exe 시작 대기 (포트 54321 바인딩까지 시간 필요) }
  Sleep(5000);

  { 브라우저 오픈 }
  BrowserURL :=
    'https://syncai-backend.fly.dev/installer-auth' +
    '?state=' + State +
    '&redirect=http%3A%2F%2Flocalhost%3A54321';

  ShellExec('open', BrowserURL, '', '', SW_SHOW, ewNoWait, ResultCode);

  { server.exe 가 .env 를 생성할 때까지 최대 120초 대기 (500ms 간격) }
  Elapsed := 0;
  while (Elapsed < 240) and (not FileExists(EnvPath)) do
  begin
    Sleep(500);
    Elapsed := Elapsed + 1;
  end;

  if not FileExists(EnvPath) then
  begin
    MsgBox(
      'Authentication timed out (120s).' + #13#10 +
      'Please re-run the installer and complete login within 2 minutes.',
      mbError, MB_OK
    );
    OAuthDone := False;
    Exit;
  end;

  OAuthDone := True;

  { MCP_BASE_DIR 추가 (일회성 - ws_client 가 WS 연결 후 삭제) }
  if SavedBaseDir <> '' then
    SaveStringToFile(
      EnvPath,
      'MCP_BASE_DIR=' + SavedBaseDir + #13#10,
      True  { append }
    );
end;


{ -- 커스텀 페이지 생성 ------------------------------------ }
procedure InitializeWizard;
begin
  SavedBaseDir := '';
  OAuthDone    := False;

  { --- 폴더 선택 페이지 (동의 화면 뒤에 삽입) --- }
  FolderPage := CreateCustomPage(
    wpLicense,
    'AI Access Folder',
    'Select the folder where AI can read and write files. Access outside this folder is blocked.'
  );

  FolderEdit := TEdit.Create(FolderPage);
  FolderEdit.Parent := FolderPage.Surface;
  FolderEdit.SetBounds(0, 12, 300, 24);
  FolderEdit.Text := '';
  FolderEdit.ReadOnly := True;

  BrowseButton := TButton.Create(FolderPage);
  BrowseButton.Parent := FolderPage.Surface;
  BrowseButton.Caption := 'Browse...';
  BrowseButton.SetBounds(308, 10, 90, 26);
  BrowseButton.OnClick := @BrowseButtonClick;

  FolderHintLabel := TLabel.Create(FolderPage);
  FolderHintLabel.Parent := FolderPage.Surface;
  FolderHintLabel.SetBounds(0, 48, 400, 60);
  FolderHintLabel.Caption :=
    'Example: C:\Users\me\Documents\work' + #13#10 +
    'Warning: Do not select a drive root (e.g. C:\).' + #13#10 +
    'You can also skip this step and set it later from the web app.';
  FolderHintLabel.WordWrap := True;
end;


{ -- 유효성 검사 ------------------------------------------ }
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  { --- 폴더 선택 페이지 (선택 선택 사항) --- }
  if CurPageID = FolderPage.ID then
  begin
    if (Trim(FolderEdit.Text) <> '') then
    begin
      if (Length(Trim(FolderEdit.Text)) <= 3) and (FolderEdit.Text[2] = ':') then
      begin
        MsgBox(
          'Drive root cannot be selected.' + #13#10 +
          'Please choose a subfolder (e.g. C:\Users\me\Documents).',
          mbError, MB_OK
        );
        Result := False;
        Exit;
      end;
      SavedBaseDir := Trim(FolderEdit.Text);
    end;
    Exit;
  end;
end;


{ -- 설치 시작 전 서비스 중지 (파일 잠금 해제) ------------- }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  Exec('sc.exe', 'stop SyncAIMCPServer', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(2000);  { 서비스 완전 중지 대기 }
end;


{ -- 파일 복사 완료 후 OAuth 실행 (서비스 시작 전) --------- }
{ ssInstall = [Files] 처리 후, [Run] 실행 전             }
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    RunOAuthFlow;
end;


{ -- 언인스톨 전 확인 -------------------------------------- }
function InitializeUninstall: Boolean;
begin
  Result := MsgBox(
    'SyncAI MCP Client를 제거하면 AI가 이 PC에 접근할 수 없게 됩니다.' + #13#10 +
    '계속하시겠습니까?',
    mbConfirmation, MB_YESNO
  ) = IDYES;
end;


{ -- 언인스톨 후 정리 -------------------------------------- }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if MsgBox(
      '설정 파일(.env)과 로그 파일을 함께 삭제하시겠습니까?',
      mbConfirmation, MB_YESNO
    ) = IDYES then
    begin
      DeleteFile(ExpandConstant('{app}\server\.env'));
      DelTree(ExpandConstant('{app}\logs'), True, True, True);
    end;
  end;
end;
