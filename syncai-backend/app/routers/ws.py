from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.auth import decode_token
from app.core import mcp_broker
import asyncio
import json
import logging
import uuid as _uuid_mod
from datetime import datetime, timezone
import redis.asyncio as aioredis
from app.core import redis_client as _redis_client
from app.config import settings

router = APIRouter(tags=["WebSocket"])
log = logging.getLogger("ws")

# 연결 관리: room_id → set of websockets
chat_connections: dict[str, set[WebSocket]] = {}
task_connections: dict[str, set[WebSocket]] = {}
mcp_connections: dict[str, set[WebSocket]] = {}  # user_id → set of websockets


async def broadcast(connections: dict[str, set[WebSocket]], room_id: str, data: dict):
    if room_id not in connections:
        return
    dead = set()
    for ws in connections[room_id]:
        try:
            await ws.send_json(data)
        except Exception:
            dead.add(ws)
    connections[room_id] -= dead


async def redis_subscriber():
    """Redis pub/sub 구독 → WebSocket 실시간 포워딩 (자동 재연결)"""
    while True:
        try:
            r = aioredis.from_url(settings.REDIS_URL, health_check_interval=30, socket_keepalive=True)
            pubsub = r.pubsub()
            await pubsub.psubscribe("syncai:chat:*", "syncai:task:*", "syncai:mcp:*")
            print("[redis_subscriber] Redis pub/sub 구독 시작")
            async for message in pubsub.listen():
                if message["type"] != "pmessage":
                    continue
                try:
                    channel = message["channel"]
                    if isinstance(channel, bytes):
                        channel = channel.decode()
                    raw_data = message["data"]
                    if isinstance(raw_data, bytes):
                        raw_data = raw_data.decode()
                    data = json.loads(raw_data)
                    parts = channel.split(":", 2)   # ["syncai", "chat", "room-id"]
                    if len(parts) != 3:
                        continue
                    _, conn_type, room_id = parts
                    if conn_type == "chat":
                        await broadcast(chat_connections, room_id, data)
                    elif conn_type == "task":
                        await broadcast(task_connections, room_id, data)
                    elif conn_type == "mcp":
                        await broadcast(mcp_connections, room_id, data)  # room_id = user_id
                except Exception as e:
                    print(f"[redis_subscriber] 메시지 처리 오류: {e}")
        except Exception as e:
            print(f"[redis_subscriber] 연결 오류: {e} — 3초 후 재연결...")
            await asyncio.sleep(3)


def _verify_ws_token(token: str) -> str | None:
    """
    WebSocket 전용 토큰 검증.
    - type == "access" 인지 확인 (refresh token 차단)
    - sub 필드 존재 여부 확인
    반환값: user_id(str) or None
    """
    payload = decode_token(token)
    if not payload:
        return None
    if payload.get("type") != "access":
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return user_id


def _resolve_ws_token(websocket: WebSocket) -> str | None:
    """쿠키 우선, 없으면 query param `token` fallback."""
    token = websocket.cookies.get("access_token")
    if not token:
        token = websocket.query_params.get("token")
    return token or None


@router.websocket("/ws/mcp")
async def ws_mcp(websocket: WebSocket):
    """MCP 연결 상태 실시간 알림 — 사용자별 WebSocket."""
    await websocket.accept()
    token = _resolve_ws_token(websocket)
    user_id = _verify_ws_token(token) if token else None
    if not user_id:
        await websocket.close(code=4001)
        return

    mcp_connections.setdefault(user_id, set()).add(websocket)

    try:
        while True:
            await websocket.receive_text()  # keep-alive ping 수신
    except WebSocketDisconnect:
        mcp_connections[user_id].discard(websocket)
    except Exception:
        mcp_connections[user_id].discard(websocket)


@router.websocket("/ws/rooms/{room_id}/chat")
async def ws_chat(websocket: WebSocket, room_id: str):
    # accept() 먼저 해야 브라우저가 close code 4001을 수신할 수 있음
    await websocket.accept()
    token = _resolve_ws_token(websocket)
    user_id = _verify_ws_token(token) if token else None
    if not user_id:
        await websocket.close(code=4001)
        return

    # slug → UUID 정규화 (broadcast 키 통일) + 유저 정보 로드
    from app.database import SessionLocal
    from app.models.chat_room import ChatRoom, RoomMember
    from app.models.team import TeamMember
    from app.models.user import User as _User
    db = SessionLocal()
    try:
        try:
            room = db.query(ChatRoom).filter(ChatRoom.id == _uuid_mod.UUID(room_id)).first()
        except (ValueError, AttributeError):
            room = db.query(ChatRoom).filter(ChatRoom.slug == room_id).first()
        if not room:
            await websocket.close(code=4004)
            return
        resolved_room_id = str(room.id)
        uid = _uuid_mod.UUID(user_id)
        is_member = (
            db.query(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id == uid).first()
            or db.query(TeamMember).filter(TeamMember.team_id == room.team_id, TeamMember.user_id == uid).first()
        )
        if not is_member:
            await websocket.close(code=4003)
            return
        user = db.query(_User).filter(_User.id == uid).first()
        user_info = {"id": user_id, "name": user.name, "email": user.email} if user else {"id": user_id, "name": "알 수 없음", "email": ""}
    finally:
        db.close()

    chat_connections.setdefault(resolved_room_id, set()).add(websocket)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "send_message":
                content = (data.get("content") or "").strip()
                if not content:
                    continue
                # UUID 미리 생성 → 즉시 broadcast → DB 저장은 백그라운드
                msg_id = str(_uuid_mod.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                await broadcast(chat_connections, resolved_room_id, {
                    "type": "message",
                    "data": {
                        "id": msg_id,
                        "room_id": resolved_room_id,
                        "user_id": user_id,
                        "content": content,
                        "type": "chat",
                        "created_at": now,
                        "user": user_info,
                    },
                })
                asyncio.create_task(_save_chat_message(resolved_room_id, user_id, content, msg_id))
    except WebSocketDisconnect:
        chat_connections[resolved_room_id].discard(websocket)
    except Exception:
        chat_connections[resolved_room_id].discard(websocket)


async def _save_chat_message(room_id: str, user_id: str, content: str, msg_id: str):
    """WS로 받은 채팅 메시지를 DB에 비동기 저장."""
    from app.database import SessionLocal
    from app.models.message import Message as _Message
    db = SessionLocal()
    try:
        msg = _Message(
            id=_uuid_mod.UUID(msg_id),
            room_id=_uuid_mod.UUID(room_id),
            user_id=_uuid_mod.UUID(user_id),
            content=content,
            type="chat",
        )
        db.add(msg)
        db.commit()
    except Exception as e:
        log.warning("[_save_chat_message] DB 저장 실패: %s", e)
    finally:
        db.close()


@router.websocket("/ws/rooms/{room_id}/tasks")
async def ws_tasks(websocket: WebSocket, room_id: str):
    # accept() 먼저 해야 브라우저가 close code 4001을 수신할 수 있음
    await websocket.accept()
    token = _resolve_ws_token(websocket)
    user_id = _verify_ws_token(token) if token else None
    if not user_id:
        await websocket.close(code=4001)
        return

    # slug → UUID 정규화 + 룸 멤버십 검증
    from app.database import SessionLocal
    from app.models.chat_room import ChatRoom, RoomMember
    from app.models.team import TeamMember
    import uuid as _uuid
    db = SessionLocal()
    try:
        try:
            room = db.query(ChatRoom).filter(ChatRoom.id == _uuid.UUID(room_id)).first()
        except (ValueError, AttributeError):
            room = db.query(ChatRoom).filter(ChatRoom.slug == room_id).first()
        if not room:
            await websocket.close(code=4004)
            return
        resolved_room_id = str(room.id)
        uid = _uuid.UUID(user_id)
        is_member = (
            db.query(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id == uid).first()
            or db.query(TeamMember).filter(TeamMember.team_id == room.team_id, TeamMember.user_id == uid).first()
        )
        if not is_member:
            await websocket.close(code=4003)
            return
    finally:
        db.close()

    task_connections.setdefault(resolved_room_id, set()).add(websocket)

    try:
        while True:
            await websocket.receive_text()  # keep-alive ping 수신
    except WebSocketDisconnect:
        task_connections[resolved_room_id].discard(websocket)
    except Exception:
        task_connections[resolved_room_id].discard(websocket)


# ─────────────────────────────────────────────────────────────────────────────
# MCP 에이전트 WebSocket (Worker PC → 백엔드 역방향 연결)
# ─────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/mcp-agent")
async def ws_mcp_agent(websocket: WebSocket):
    """
    MCP 서버(Worker PC)가 백엔드로 역방향 WebSocket 연결을 맺는 엔드포인트.
    ?token=xxx 쿼리파라미터로 인증.

    수신 메시지 종류 (MCP 서버 → 백엔드):
      - tool_response: 툴 호출 응답 → mcp_broker.resolve_response() 로 Future 완료
      - base_dir_update: 폴더 선택 완료 → DB 업데이트
      - ping: keep-alive (무시)
    """
    from app.database import SessionLocal
    from app.models.mcp_config import McpConfig

    mcp_token = websocket.query_params.get("token", "")
    if not mcp_token:
        await websocket.close(code=4008)
        return

    # DB에서 토큰 검증
    db = SessionLocal()
    try:
        config = db.query(McpConfig).filter(McpConfig.mcp_token == mcp_token).first()
        if not config:
            await websocket.close(code=4008)
            return
        user_id = str(config.owner_user_id)
        config_id = str(config.id)
        base_dir = config.base_dir  # commit 전에 읽어야 expire 안 됨
        config.is_online = True
        db.commit()
    finally:
        db.close()

    await websocket.accept()
    mcp_broker.agent_connections[mcp_token] = websocket
    log.info("[mcp-agent] 연결: config=%s ...%s", config_id[:8], mcp_token[-6:])

    # base_dir을 먼저 MCP 서버에 전달한 뒤 프론트에 "온라인" 알림.
    # 순서가 반대면 Worker가 tool_call을 보내는 시점에 MCP 서버의 base_dir가
    # 아직 None일 수 있어 "base_dir 미설정" 오류가 발생한다.
    if base_dir:
        # PC 재부팅 후 base_dir 복원: DB 값을 MCP 서버에 전달
        try:
            await websocket.send_json({"type": "base_dir_restore", "base_dir": base_dir})
            log.info("[mcp-agent] base_dir 복원 전송: ...%s → %s", mcp_token[-6:], base_dir)
        except Exception as e:
            log.warning("[mcp-agent] base_dir 복원 전송 실패: %s", e)
    else:
        # DB에 base_dir 없음 → MCP 서버에 폴더 선택 팝업 요청
        # (최초 설치 또는 DB 초기화 후 복원 불가 상황)
        try:
            await websocket.send_json({"type": "request_folder_pick", "mcp_config_id": config_id})
            log.info("[mcp-agent] base_dir 없음 → 폴더 선택 요청: config=%s", config_id[:8])
        except Exception as e:
            log.warning("[mcp-agent] 폴더 선택 요청 전송 실패: %s", e)

    # base_dir 전달 완료 후 프론트에 "온라인" 알림
    _publish_mcp_status(user_id, config_id, online=True)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "tool_response":
                # 툴 호출 응답 → 대기 중인 Future 완료
                mcp_broker.resolve_response(
                    request_id=data.get("id", ""),
                    result=data.get("result"),
                    error=data.get("error"),
                )

            elif msg_type == "base_dir_update":
                # MCP 서버가 폴더 선택 완료 후 경로 전송
                # payload에 mcp_token이 있으면 new_config 이벤트로 등록된 새 토큰 — 해당 config 업데이트
                base_dir = data.get("base_dir", "")
                payload_token = data.get("mcp_token", "").strip()
                if base_dir:
                    if payload_token and payload_token != mcp_token:
                        target_token, target_config_id = _resolve_same_user_token(payload_token, user_id)
                    else:
                        target_token, target_config_id = mcp_token, config_id
                    if target_token:
                        _update_base_dir(target_token, base_dir)
                        _publish_mcp_status(user_id, target_config_id, online=True, base_dir=base_dir)

            elif msg_type == "ping":
                pass  # keep-alive, 무시

            else:
                log.debug("[mcp-agent] 알 수 없는 메시지: %s", msg_type)

    except WebSocketDisconnect:
        log.info("[mcp-agent] 연결 해제: config=%s", config_id[:8])
    except Exception as e:
        log.warning("[mcp-agent] 오류: %s", e)
    finally:
        mcp_broker.agent_connections.pop(mcp_token, None)
        # is_online = False 처리
        db = SessionLocal()
        try:
            config = db.query(McpConfig).filter(McpConfig.mcp_token == mcp_token).first()
            if config:
                config.is_online = False
                db.commit()
        finally:
            db.close()
        _publish_mcp_status(user_id, config_id, online=False)


def _update_base_dir(mcp_token: str, base_dir: str) -> None:
    """MCP 서버가 폴더 선택 완료 시 DB 업데이트."""
    from app.database import SessionLocal
    from app.models.mcp_config import McpConfig
    db = SessionLocal()
    try:
        config = db.query(McpConfig).filter(McpConfig.mcp_token == mcp_token).first()
        if config:
            log.info("[mcp-agent] base_dir 업데이트: %s → %s", config.base_dir, base_dir)
            config.base_dir = base_dir
            db.commit()
    finally:
        db.close()


def _resolve_same_user_token(token: str, user_id: str) -> tuple[str, str]:
    """
    token이 user_id 소유인지 확인. 맞으면 (token, config_id) 반환, 아니면 ("", "") 반환.
    new_config 이벤트로 전달된 새 토큰 검증용.
    """
    from app.database import SessionLocal
    from app.models.mcp_config import McpConfig
    db = SessionLocal()
    try:
        config = db.query(McpConfig).filter(McpConfig.mcp_token == token).first()
        if config and str(config.owner_user_id) == user_id:
            return token, str(config.id)
        log.warning("[mcp-agent] base_dir_update 토큰 불일치 — payload token 무시 (...%s)", token[-6:] if token else "")
        return "", ""
    finally:
        db.close()


def _publish_mcp_status(user_id: str, config_id: str, online: bool, base_dir: str | None = None) -> None:
    """MCP 연결/해제 이벤트를 Redis pub/sub으로 알림 → 프론트 WebSocket으로 실시간 전파."""
    try:
        payload: dict = {
            "type": "mcp_status",
            "config_id": config_id,
            "is_online": online,
        }
        if base_dir is not None:
            payload["base_dir"] = base_dir
        _redis_client.publish(f"syncai:mcp:{user_id}", json.dumps(payload))
    except Exception as e:
        log.warning("[mcp-agent] Redis publish 실패: %s", e)
