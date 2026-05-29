# MCP Server 변경 이력

## 2026-05-18

### Cloudflare Tunnel 자동화

**배경**: heartbeat가 항상 `localhost`를 endpoint로 전송해 외부 배포가 불가능했던 문제 해결.

**신규 파일**
- `tunnel.py` — cloudflared를 asyncio subprocess로 실행, stdout/stderr에서 `trycloudflare.com` URL 자동 감지, `config.TUNNEL_URL` 갱신. 미설치/감지 실패 시 localhost fallback.

**수정 파일**
- `config.py` — `TUNNEL_URL: str = os.getenv("MCP_TUNNEL_URL", "")` 추가 (환경변수 수동 지정 지원)
- `heartbeat.py` — `_send_heartbeat()` endpoint를 `TUNNEL_URL or localhost` 로 변경 (1줄 수정)
- `server.py` — startup 이벤트에서 `asyncio.create_task(tunnel.start_and_detect(PORT))` 추가
- `start.bat` / `start.sh` — 수동 등록 안내 문구 제거, cloudflared 설치 여부 체크 및 안내 추가
- `.env.example` — `MCP_TUNNEL_URL=` 항목 추가 (Cloudflare Tunnel 섹션)

**동작 방식**
1. 서버 시작 → cloudflared 자동 실행 (비동기, 서버 기동 블로킹 없음)
2. 최대 30초 내 공개 URL 감지 → `config.TUNNEL_URL` 갱신
3. heartbeat 다음 주기부터 공개 URL로 endpoint 전송
4. cloudflared 미설치 또는 감지 실패 → localhost로 graceful fallback

**테스트 결과** (2026-05-18, 단위 6/6 + 통합 6/6 전체 통과)
- cloudflared 자동 실행: 서버 기동 후 1초 내
- 공개 URL 감지 소요 시간: 약 5초
- 외부 URL `/health` 접근 확인 완료

## 2026-05-15

### start.bat — UAC elevation 제거 (원복)
- 드라이브 루트(`C:\`) 사용이 실제 원인 — UAC 강제는 불필요하다고 판단
- 원본 상태로 복원

### mcp-settings-modal.tsx — base_dir 드라이브 루트 차단
- `isRootPath()` 함수로 `C:\`, `D:/` 등 드라이브 루트 패턴 감지
- 등록 폼 입력 중 실시간 amber 경고 표시
- `handleCreate` 에서 루트 경로 시 등록 차단 + 에러 메시지
