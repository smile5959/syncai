"""
ARQ Worker — 현재 비활성화됨

AI 태스크는 FastAPI 인-프로세스로 처리합니다 (messages.py::_run_ai_task).
Worker/MCP 구조 분리 이후 ARQ는 더 이상 사용하지 않습니다.
이 파일은 호환성을 위해 보존되지만 실행할 필요가 없습니다.

백엔드 실행: python -m uvicorn app.main:app --port 8001
"""

if __name__ == "__main__":
    print("ℹ️  ARQ Worker는 더 이상 사용하지 않습니다.")
    print("   AI 태스크는 FastAPI 내부(messages.py)에서 처리됩니다.")
    print("   백엔드: python -m uvicorn app.main:app --port 8001")
