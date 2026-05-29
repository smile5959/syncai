# SyncAI — 인덱스

> 채팅방 안에서 AI가 로컬 코드를 직접 수정한다 — PC 없이도

## 파일 구조
| 파일 | 내용 | 로드 시점 |
|------|------|-----------|
| `syncai_index.md` | 현황 요약 + 파일 안내 | 항상 |
| `syncai_product.md` | 제품 정의 / 경쟁사 / 비즈니스 모델 | 기획·전략 논의 시 |
| `syncai_api.md` | API 전체 명세 | API 설계·수정 시 |
| `syncai_backend.md` | 백엔드 구조 / 실행법 / 완료 목록 | 백엔드 작업 시 |
| `syncai_frontend.md` | 프론트 구조 / 실행법 / 완료 목록 | 프론트 작업 시 |

## 기술 스택 요약
- **백엔드**: FastAPI + PostgreSQL(5433) + Redis + ARQ / 포트 8001
- **프론트**: Next.js 16 (App Router) + TypeScript + Tailwind v4 + Zustand / 포트 3000
- **AI**: Gemini 2.5 Flash (Vertex AI) — GCP 서비스 계정 인증, Supervisor→Worker 멀티에이전트 (MCP JSON-RPC 2.0)

## 현재 개발 상태
| 영역 | 상태 | 비고 |
|------|------|------|
| 백엔드 API | ✅ 완료 | auth/teams/workers/rooms/messages/tasks/users/ws/mcp-configs |
| 프론트 전 화면 | ✅ 완료 | 로그인~온보딩~채팅방~diff~MCP설정 |
| UI 리디자인 | ✅ 완료 | 라이트/다크 토글, 그라디언트 액센트, 분할 로그인, 색상 토큰 통일 |
| 온보딩 플로우 | ✅ 완료 | 로그인→팀유무 확인→/onboarding→/rooms |
| MD 파일 재편 | ✅ 완료 | index/product/api/backend/frontend 5파일로 분리 |
| 팀 초대 UI | ✅ 완료 | 초대 생성 + 수락/거절 (team_invitations 테이블, 벨 알림) |
| 실시간 채팅 | ✅ 완료 | broadcast 확인, 내/상대 메시지 좌우 구분 (카카오톡 스타일) |
| MCP 서버 | ✅ 완료 | `mcp-server/` — FastAPI JSON-RPC 2.0, heartbeat 자동전송, path 보안 |
| AI 시스템 프롬프트 | ✅ 완료 | 한국어 우선, 툴 적극 사용, 대화형으로 개선 |
| AI 실시간 응답 | ✅ 완료 | 인-프로세스 실행 + WS 직접 broadcast |
| GCP 서비스 계정 인증 | ✅ 완료 | Vertex AI 엔드포인트 + OAuth2 토큰 |
| /ai 엔드투엔드 | ✅ 동작 확인 | MCP 인증 포함 실제 파일 접근 동작 확인 |
| Worker/MCP 구조 분리 | ✅ 완료 | workers=AI슬롯, mcp_configs=사용자PC설정, @mention, 큐 시스템 |
| Task revert | ✅ 완료 | backup_snapshot + MCP write_file/delete_file 복원, SELECT FOR UPDATE |
| MCP 멀티 토큰 | ✅ 완료 | token_registry.json, 토큰별 base_dir 격리, 자동 주입 UI |
| seed_dev.py | ✅ 완료 | DB 리셋 후 `python scripts/seed_dev.py` 한 방으로 mcp_configs 복구 |

## 다음 할 것 (우선순위 순)
1. **채팅방별 접근 권한** — 팀원별 채팅방 지정
2. **Cloudflare Tunnel** — 클라우드 배포, MCP 서버 public URL 자동 등록
3. **엔드투엔드 테스트** — Worker 슬롯 큐, @mention, diff 뷰, revert 동작 확인
