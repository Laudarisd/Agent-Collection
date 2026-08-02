#!/bin/bash
# filepath: ./run.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
LOG_DATE="$(date +%F)"
BACKEND_LOG="$LOG_DIR/backend_${LOG_DATE}.log"
FRONTEND_LOG="$LOG_DIR/frontend_${LOG_DATE}.log"
BACKEND_PORT=8000
FRONTEND_PORT=5174

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

check_port_free() {
  local port="$1"
  local name="$2"
  if lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    echo "$name port $port is already in use."
    echo "Run: lsof -iTCP:$port -sTCP:LISTEN -n -P"
    echo "Then stop that process, or change the port and retry."
    exit 1
  fi
}

check_port_free "$BACKEND_PORT" "Backend"
check_port_free "$FRONTEND_PORT" "Frontend"

mkdir -p "$LOG_DIR"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backend" >>"$BACKEND_LOG"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting frontend" >>"$FRONTEND_LOG"

# Sync Python deps from root-level uv project.
cd "$ROOT_DIR"
uv sync

cd "$ROOT_DIR/backend"
uv run --project "$ROOT_DIR" python app.py >>"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

cd "$ROOT_DIR/frontend"
npm install
npm run dev >>"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

sleep 2

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "Backend failed to start. Check $BACKEND_LOG"
  tail -n 40 "$BACKEND_LOG" || true
  exit 1
fi

if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
  echo "Frontend failed to start. Check $FRONTEND_LOG"
  tail -n 40 "$FRONTEND_LOG" || true
  exit 1
fi

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Backend: http://localhost:$BACKEND_PORT"
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Logs: $BACKEND_LOG and $FRONTEND_LOG"
echo "Press Ctrl+C to stop"

wait
