#!/bin/bash
set -e

echo "==> Running DB migrations..."
PYTHONPATH=/app alembic upgrade head

echo "==> Starting server on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
