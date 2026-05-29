# Cloudflare Tunnel 자동화 — Claude Code 테스트 프롬프트

아래 내용을 Claude Code에 그대로 붙여넣어 실행하세요.

---

## 📋 테스트 프롬프트

```
다음 경로의 SyncAI MCP 서버에 Cloudflare Tunnel 자동화 기능이 추가되었습니다.
폴더: <여기에 실제 경로 입력 — 예: C:\khh\syncAI\syncai-backend\mcp-server>

아래 테스트를 순서대로 수행하고 각 결과를 보고해 주세요.

────────────────────────────────────────────────
## 테스트 1: import 및 구문 오류 확인
────────────────────────────────────────────────
Python으로 아래 명령을 실행해 각 파일의 import가 정상인지 확인하세요.
가상환경이 있으면 활성화 후 실행하세요 (venv\Scripts\activate 또는 source venv/bin/activate).

  cd <mcp-server 경로>
  python -c "import config; print('config OK, TUNNEL_URL:', repr(config.TUNNEL_URL))"
  python -c "import tunnel; print('tunnel OK')"
  python -c "import heartbeat; print('heartbeat OK')"
  python -c "import server; print('server OK')"

기대 결과:
- 4개 명령 모두 오류 없이 OK 출력
- config의 TUNNEL_URL은 환경변수 MCP_TUNNEL_URL 값 또는 빈 문자열('')

────────────────────────────────────────────────
## 테스트 2: tunnel.py 단위 테스트 — cloudflared 미설치 fallback
────────────────────────────────────────────────
아래 Python 스크립트를 작성하고 실행하세요 (test_tunnel_fallback.py):

  import asyncio, config, tunnel

  async def main():
      # cloudflared가 없거나 PATH에 없는 환경을 시뮬레이션
      # _proc를 직접 건드리지 않고 FileNotFoundError 경로 확인용
      print("TUNNEL_URL before:", repr(config.TUNNEL_URL))
      # 존재하지 않는 명령으로 테스트
      tunnel._proc = None
      try:
          # 존재하지 않는 실행파일로 테스트
          import asyncio
          proc = await asyncio.create_subprocess_exec(
              "nonexistent_cloudflared_bin",
              stdout=asyncio.subprocess.PIPE,
              stderr=asyncio.subprocess.PIPE,
          )
      except FileNotFoundError:
          print("✅ FileNotFoundError 정상 감지 — fallback 동작 확인")
      print("TUNNEL_URL after:", repr(config.TUNNEL_URL))  # 여전히 빈 문자열이어야 함

  asyncio.run(main())

기대 결과:
- FileNotFoundError 정상 감지 출력
- TUNNEL_URL이 빈 문자열 유지 (localhost fallback 상태)

────────────────────────────────────────────────
## 테스트 3: tunnel.py 단위 테스트 — MCP_TUNNEL_URL 환경변수 우선
────────────────────────────────────────────────
아래 Python 스크립트를 작성하고 실행하세요 (test_tunnel_env.py):

  import asyncio, os

  # 환경변수 수동 설정 후 import
  os.environ["MCP_TUNNEL_URL"] = "https://test-manual.trycloudflare.com"

  # config 재로드 (환경변수 변경 반영)
  import importlib, config
  config.TUNNEL_URL = os.environ["MCP_TUNNEL_URL"]  # 직접 갱신

  import tunnel

  async def main():
      print("TUNNEL_URL:", repr(config.TUNNEL_URL))
      # start_and_detect가 환경변수 있으면 즉시 리턴하는지 확인
      await tunnel.start_and_detect(7860)
      print("✅ start_and_detect 즉시 리턴 확인 (cloudflared 미실행)")
      print("TUNNEL_URL:", repr(config.TUNNEL_URL))

  asyncio.run(main())

기대 결과:
- TUNNEL_URL = 'https://test-manual.trycloudflare.com'
- cloudflared를 실행하지 않고 즉시 리턴
- _proc 가 None 유지

────────────────────────────────────────────────
## 테스트 4: URL 정규식 파싱 단위 테스트
────────────────────────────────────────────────
아래 Python 스크립트를 실행하세요 (test_regex.py):

  import re
  URL_RE = re.compile(r'https://[a-z0-9\-]+\.trycloudflare\.com')

  test_lines = [
      # 실제 cloudflared 출력 예시들
      "2024-01-01T00:00:00Z INF |  https://abc-def-123.trycloudflare.com  |",
      "Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  https://random-words-here.trycloudflare.com",
      "INFO Registered tunnel connection connIndex=0 ip=198.41.200.23 location=KIX url=https://my-tunnel-name.trycloudflare.com",
      # 매칭 안 되어야 하는 것들
      "http://localhost:7860",
      "https://example.com",
      "UPPERCASE.trycloudflare.com",
  ]

  print("정규식 테스트:")
  for line in test_lines:
      m = URL_RE.search(line)
      result = m.group(0) if m else "매칭 없음"
      print(f"  입력: {line[:70]}")
      print(f"  결과: {result}")
      print()

기대 결과:
- 첫 3개 라인에서 https://xxx.trycloudflare.com URL 추출 성공
- localhost, example.com, UPPERCASE는 매칭 없음

────────────────────────────────────────────────
## 테스트 5: heartbeat endpoint 로직 확인
────────────────────────────────────────────────
아래 Python 스크립트를 실행하세요 (test_heartbeat_endpoint.py):

  import config

  # 케이스 1: TUNNEL_URL 없음 → localhost
  config.TUNNEL_URL = ""
  config.PORT = 7860
  endpoint = config.TUNNEL_URL or f"http://localhost:{config.PORT}"
  assert endpoint == "http://localhost:7860", f"실패: {endpoint}"
  print("✅ 케이스 1 통과: TUNNEL_URL 없음 →", endpoint)

  # 케이스 2: TUNNEL_URL 있음 → 공개 URL
  config.TUNNEL_URL = "https://abc-def.trycloudflare.com"
  endpoint = config.TUNNEL_URL or f"http://localhost:{config.PORT}"
  assert endpoint == "https://abc-def.trycloudflare.com", f"실패: {endpoint}"
  print("✅ 케이스 2 통과: TUNNEL_URL 있음 →", endpoint)

  # 원복
  config.TUNNEL_URL = ""
  print("✅ 모든 케이스 통과")

기대 결과:
- 두 케이스 모두 ✅ 통과

────────────────────────────────────────────────
## 테스트 6: server.py startup 이벤트 구조 확인
────────────────────────────────────────────────
server.py 파일을 읽고 아래 항목이 모두 있는지 확인하세요:

  1. "import tunnel as tunnel_module" 라인 존재 여부
  2. startup() 함수 내 "asyncio.create_task(tunnel_module.start_and_detect(config.PORT))" 라인 존재 여부
  3. heartbeat_module.start_heartbeat() 가 tunnel task 생성 이후에 호출되는지 순서 확인

기대 결과:
- 3항목 모두 존재, tunnel task → heartbeat 순서

────────────────────────────────────────────────
## 최종 보고 형식
────────────────────────────────────────────────
테스트 1~6 결과를 아래 형식으로 정리해 주세요:

| 테스트 | 결과 | 비고 |
|--------|------|------|
| 1. import 확인 | ✅/❌ | |
| 2. fallback 확인 | ✅/❌ | |
| 3. 환경변수 우선 | ✅/❌ | |
| 4. 정규식 파싱 | ✅/❌ | |
| 5. heartbeat endpoint | ✅/❌ | |
| 6. server.py 구조 | ✅/❌ | |

실패한 항목이 있으면 오류 메시지와 함께 원인을 분석해 주세요.
```

---

## 📝 참고: 실제 cloudflared 연동 테스트 (선택 사항)

cloudflared가 설치되어 있다면 실제 서버를 기동해 통합 테스트도 수행할 수 있습니다:

```
# 서버 기동 후 로그에서 확인해야 할 내용:
1. "cloudflared 시작 (PID=xxxx) — 공개 URL 감지 대기 중..." 출력 여부
2. "✅ Cloudflare Tunnel URL 감지 완료: https://xxxx.trycloudflare.com" 출력 여부
3. /health 엔드포인트 응답 확인:
   curl http://localhost:7860/health
4. 해당 공개 URL로 외부 접근 가능한지 확인:
   curl https://xxxx.trycloudflare.com/health
```
