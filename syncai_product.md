# SyncAI — 제품 & 비즈니스

## 차별점

| 서비스 | 한계 | SyncAI |
|--------|------|--------|
| Slack + Claude | 조언만, 파일 수정 불가 | AI가 직접 파일 열고 수정 |
| Cursor | 개인 도구, 팀 공유 없음 | 팀 채팅방에서 함께 봄 |
| 위 둘 조합 | PC 앞에 있어야 함 | 모바일에서도 원격 제어 |

## 경쟁사 포지셔닝

| 서비스 | 핵심 한계 |
|--------|-----------|
| Devin | 클라우드 샌드박스, 내 로컬 파일 못 건드림. 월 $500 |
| Cline | VS Code 개인 도구, 팀 공유 안 됨 |
| Copilot Workspace | GitHub 이슈 기반, 실시간 팀 채팅 없음 |
| Cursor | 개인 IDE, 팀 협업 기능 없음 |

> SyncAI = Devin처럼 강력하지만 내 로컬 + Cursor처럼 내 환경이지만 팀과 함께

## 타깃
- 초기: 개발팀 (수동 MCP 세팅 가능)
- 이후: 비전공자까지 (데스크탑 앱으로 자동화)

## 비즈니스 모델
Worker(AI 동시 작업 슬롯) 개수 기반 요금제

| 플랜 | Worker 수 | 대상 |
|------|-----------|------|
| Free | 1개 | 개인/테스트 |
| Pro | 3개 | 소규모 팀 |
| Business | 10개+ | 중대형 팀 |

**미결**: 요금제별 팀원 수 제한 방식 / 가격 (API 비용 분석 후 결정)

## Worker vs MCP 개념 분리 (확정)

| 개념 | 정의 | 소유 단위 |
|------|------|-----------|
| **Worker** | AI 동시 작업 슬롯. 팀 플랜으로 개수 결정 | 팀 |
| **MCP Config** | 사용자 PC 접근 설정 (endpoint/base_dir/token) | 사용자 |

- MCP Config는 사용자 소유, 팀별로 공개/비공개 설정 가능
- 팀 A에는 공개, 팀 B에는 비공개 가능
- Worker 슬롯이 모두 사용 중이면 `/ai` 요청은 큐에 대기

## MCP 접근 제어 (확정)

- `is_public` per team: 팀마다 공개 여부 별도 설정
- Public MCP: 팀원 누구나 `/ai` 작업에 사용 가능
- Private MCP: 본인만 사용 가능
- 한 `/ai` 작업에서 여러 public MCP 동시 접근 가능

## /ai MCP 선택 방식 (확정)

- **명시**: `/ai @내PC 버그 고쳐줘` → 해당 MCP 직접 지정
- **자동**: `/ai 버그 고쳐줘` → AI가 팀 내 public MCP 목록 보고 판단
- 두 방식 공존. 명시 우선, 없으면 AI 자동 선택

## AI 구조
- 평소 채팅: LLM 미호출, 버퍼에 저장만
- `/ai` 커맨드: 최근 20개 컨텍스트 → Worker 슬롯 점유 → MCP 선택(@mention or AI판단) → Supervisor → 파일 수정 → 결과 공유 → 슬롯 반환

## UX 결정사항
- **파일 충돌**: 큐잉 방식 (거절 X) → 완료 후 채팅방 자동 알림
- **Worker 고갈**: 큐 대기 (즉시 에러 반환 X)
- **온보딩**: `curl -sSL syncai.dev/install | bash` 스크립트 1개로 Tunnel + MCP 자동 설치
- **권한**: MCP Config 팀별 공개/비공개

## 개발 단계
1. MCP 로컬 연결 + 채팅방 + AI 파일 수정 (핵심 증명) ✅
2. Worker/MCP 구조 분리 리팩토링 + Task revert ← 현재
3. Supervisor/Worker 멀티 에이전트 고도화 + 요금제
4. 모바일 리모트 (Cloudflare Tunnel)
5. 데스크탑 앱 (Electron, 비전공자 대응)

## 와이어프레임
https://www.figma.com/design/jtrZRMhusdfaC9LsuxoQno/syncAi
- 01. 로그인 / 02. 채팅방 목록 / 03. 채팅방 메인 / 04. AI 작업 진행 중 / 05. AI 작업 결과(Diff) / 06. MCP 연결 설정
