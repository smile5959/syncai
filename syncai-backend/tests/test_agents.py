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
        with pytest.raises(MCPError, match="MCP 연결 실패"):
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
# supervisor.py는 OpenAI 호환 클라이언트(Gemini)를 사용:
#   from openai import AsyncOpenAI
#   client = AsyncOpenAI(api_key=..., base_url=...)
#   response = await client.chat.completions.create(...)
# ─────────────────────────────────────────

def make_openai_response(finish_reason, content=None, tool_calls=None):
    """OpenAI ChatCompletion 응답 mock 생성"""
    message = MagicMock()
    message.content = content
    message.tool_calls = tool_calls

    choice = MagicMock()
    choice.finish_reason = finish_reason
    choice.message = message

    resp = MagicMock()
    resp.choices = [choice]
    return resp


def make_openai_tool_call(tool_name, args, call_id="tc_001"):
    """OpenAI tool_call mock 생성"""
    tool_call = MagicMock()
    tool_call.id = call_id
    tool_call.function.name = tool_name
    tool_call.function.arguments = json.dumps(args)
    return tool_call


@pytest.mark.asyncio
async def test_supervisor_simple_response():
    """tool_calls 없이 바로 stop 응답"""
    mcp = AsyncMock()
    worker = make_worker(mcp)

    with patch("app.agents.supervisor.AsyncOpenAI") as mock_cls, \
         patch("app.agents.supervisor._get_client", new=AsyncMock(return_value=("https://fake.url/", "fake-key"))):
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_client.chat.completions.create = AsyncMock(
            return_value=make_openai_response("stop", content="안녕하세요!")
        )

        supervisor = SupervisorAgent(mcp, worker)
        progress_calls = []
        async def on_progress(msg): progress_calls.append(msg)

        result = await supervisor.run("안녕", [], on_progress)
        assert result == "안녕하세요!"


@pytest.mark.asyncio
async def test_supervisor_tool_use_loop():
    """tool_calls → tool 결과 → stop 루프"""
    mcp = AsyncMock()
    worker = make_worker(mcp)
    mcp.call_tool.return_value = "print('hello')"  # read_file 결과

    tool_call = make_openai_tool_call("read_file", {"path": "main.py"}, "tc_1")

    responses = [
        make_openai_response("tool_calls", tool_calls=[tool_call]),
        make_openai_response("stop", content="main.py를 읽었습니다. print 함수가 있네요."),
    ]

    with patch("app.agents.supervisor.AsyncOpenAI") as mock_cls, \
         patch("app.agents.supervisor._get_client", new=AsyncMock(return_value=("https://fake.url/", "fake-key"))):
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_client.chat.completions.create = AsyncMock(side_effect=responses)

        supervisor = SupervisorAgent(mcp, worker)
        progress_msgs = []
        async def on_progress(msg): progress_msgs.append(msg)

        result = await supervisor.run("/ai main.py 설명해줘", [], on_progress)

        assert "main.py" in result
        assert any("read_file" in m or "파일 읽는 중" in m for m in progress_msgs)
        assert mock_client.chat.completions.create.call_count == 2
