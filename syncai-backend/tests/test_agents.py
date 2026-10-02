"""
멀티에이전트 유닛 테스트
- MCPClient: JSON-RPC 요청 형식 검증
- WorkerAgent: 툴 실행 + diff 생성
- SupervisorAgent: tool_use 루프
"""
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from app.agents.mcp_client import MCPClient, MCPError
from app.agents.worker import WorkerAgent
from app.agents.supervisor import SupervisorAgent


# ─────────────────────────────────────────
# MCPClient 테스트
# ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_mcp_client_call_tool_success():
    """정상 MCP 응답 파싱"""
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "jsonrpc": "2.0",
        "result": {"content": [{"text": "파일 내용입니다"}]},
        "id": 1,
    }
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_http:
        mock_http.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)
        client = MCPClient("http://worker.tunnel.example.com")
        result = await client.call_tool("read_file", {"path": "src/main.py"})
        assert result == "파일 내용입니다"


@pytest.mark.asyncio
async def test_mcp_client_error_response():
    """MCP 에러 응답 시 MCPError 발생"""
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "jsonrpc": "2.0",
        "error": {"code": -32000, "message": "File not found"},
        "id": 1,
    }
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_http:
        mock_http.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)
        client = MCPClient("http://worker.tunnel.example.com")
        with pytest.raises(MCPError):
            await client.call_tool("read_file", {"path": "없는파일.py"})


@pytest.mark.asyncio
async def test_mcp_client_connection_error():
    """연결 실패 시 MCPError 발생"""
    import httpx
    with patch("httpx.AsyncClient") as mock_http:
        mock_http.return_value.__aenter__.return_value.post = AsyncMock(
            side_effect=httpx.RequestError("연결 거부")
        )
        client = MCPClient("http://offline-worker.example.com")
        with pytest.raises(MCPError, match="MCP 서버에 연결할 수 없습니다"):
            await client.call_tool("read_file", {"path": "test.py"})


# ─────────────────────────────────────────
# WorkerAgent 테스트
# ─────────────────────────────────────────

def make_worker(mcp_mock, task_id="00000000-0000-0000-0000-000000000001", worker_id="00000000-0000-0000-0000-000000000002"):
    db = MagicMock()
    db.add = MagicMock()
    db.delete = MagicMock()
    db.commit = MagicMock()
    db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = None
    db.query.return_value.filter.return_value.first.return_value = None
    db.query.return_value.filter.return_value.delete.return_value = None
    return WorkerAgent(mcp_mock, db, task_id, worker_id)


@pytest.mark.asyncio
async def test_worker_read_file():
    mcp = AsyncMock()
    mcp.call_tool.return_value = "def hello(): pass"
    worker = make_worker(mcp)

    result = await worker.execute_tool("read_file", {"path": "app/main.py"})
    assert result == "def hello(): pass"
    mcp.call_tool.assert_called_once_with("read_file", {"path": "app/main.py"})


@pytest.mark.asyncio
async def test_worker_write_file_and_diff():
    mcp = AsyncMock()
    # read_file 호출 시 기존 내용 반환
    mcp.call_tool.side_effect = [
        "def hello():\n    pass\n",  # 첫 번째 read (before)
        None,  # write_file 결과
    ]
    worker = make_worker(mcp)

    result = await worker.execute_tool("write_file", {
        "path": "app/main.py",
        "content": "def hello():\n    print('hi')\n",
    })
    assert "파일 저장 완료" in result

    diff = worker.generate_diff()
    assert "app/main.py" in diff
    assert "-    pass" in diff
    assert "+    print" in diff


@pytest.mark.asyncio
async def test_worker_unsupported_tool():
    mcp = AsyncMock()
    worker = make_worker(mcp)
    result = await worker.execute_tool("delete_database", {})
    assert "지원하지 않는 툴" in result


@pytest.mark.asyncio
async def test_worker_generate_diff_empty_when_no_changes():
    mcp = AsyncMock()
    worker = make_worker(mcp)
    assert worker.generate_diff() == ""


# ─────────────────────────────────────────
# SupervisorAgent 테스트
# 역할: analyze()(작업 계획 생성) · validate()(Worker 결과 검증)
# tool-calling 루프는 WorkerLLM으로 이동했다.
# OpenAI 호환 클라이언트(OpenRouter) 사용 → AsyncOpenAI·_get_client를 mock
# ─────────────────────────────────────────

def make_openai_response(content):
    """OpenAI ChatCompletion 응답 mock 생성"""
    message = MagicMock()
    message.content = content
    choice = MagicMock()
    choice.message = message
    resp = MagicMock()
    resp.choices = [choice]
    return resp


def _patch_llm(create):
    mock_client = MagicMock()
    mock_client.chat.completions.create = create
    return (
        patch("app.agents.supervisor.AsyncOpenAI", return_value=mock_client),
        patch("app.agents.supervisor._get_client", new=AsyncMock(return_value=("https://fake.url/", "fake-key"))),
    )


@pytest.mark.asyncio
async def test_supervisor_analyze_returns_task_plan():
    """LLM이 준 JSON의 task_plan을 반환 (```json 펜스도 허용)"""
    create = AsyncMock(return_value=make_openai_response('```json\n{"task_plan": "main.py의 hello 함수 수정"}\n```'))
    p1, p2 = _patch_llm(create)
    with p1, p2:
        plan = await SupervisorAgent().analyze("main.py 고쳐줘", [{"role": "user", "content": "맥락"}])
    assert plan == "main.py의 hello 함수 수정"
    messages = create.call_args.kwargs["messages"]
    assert messages[-1] == {"role": "user", "content": "main.py 고쳐줘"}


@pytest.mark.asyncio
async def test_supervisor_analyze_falls_back_to_command():
    """LLM 오류·잘못된 응답이면 원본 command 그대로 반환"""
    p1, p2 = _patch_llm(AsyncMock(return_value=make_openai_response("JSON 아님")))
    with p1, p2:
        assert await SupervisorAgent().analyze("원본 명령", []) == "원본 명령"


@pytest.mark.asyncio
async def test_supervisor_validate():
    """검증 실패 시 retry_plan 반환, LLM 오류 시 success=True(무한 재시도 방지)"""
    p1, p2 = _patch_llm(AsyncMock(return_value=make_openai_response('{"success": false, "retry_plan": "파일도 저장해"}')))
    with p1, p2:
        result = await SupervisorAgent().validate("저장해줘", "했습니다", {})
    assert result == {"success": False, "retry_plan": "파일도 저장해"}

    p1, p2 = _patch_llm(AsyncMock(side_effect=RuntimeError("down")))
    with p1, p2:
        result = await SupervisorAgent().validate("저장해줘", "했습니다", {})
    assert result == {"success": True, "retry_plan": None}
