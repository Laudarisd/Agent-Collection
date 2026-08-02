#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
health_url="http://127.0.0.1:8080/health"
model_log="$project_dir/logs/llama-server.log"
model_pid=""

cleanup() {
  if [[ -n "$model_pid" ]]; then
    kill "$model_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "$project_dir/logs"
if curl --silent --fail --max-time 2 "$health_url" >/dev/null 2>&1; then
  echo "Local Qwen model is already running."
else
  echo "Starting the local Qwen model. Initial loading can take a minute..."
  "$project_dir/scripts/run_llm.sh" >"$model_log" 2>&1 &
  model_pid=$!
  for attempt in {1..90}; do
    if curl --silent --fail --max-time 2 "$health_url" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$model_pid" 2>/dev/null; then
      echo "The model server stopped unexpectedly. Log: $model_log" >&2
      tail -n 20 "$model_log" >&2
      exit 1
    fi
    sleep 1
  done
  if ! curl --silent --fail --max-time 2 "$health_url" >/dev/null 2>&1; then
    echo "The model did not become ready within 90 seconds. Log: $model_log" >&2
    exit 1
  fi
  echo "Local Qwen model is ready."
fi

echo "Opening Job Agent: http://localhost:8501"
"$project_dir/scripts/run_app.sh"
