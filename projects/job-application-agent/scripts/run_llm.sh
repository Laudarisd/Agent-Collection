#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
model_path="${LLAMA_MODEL_PATH:-$project_dir/models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf}"
server_bin="${LLAMA_SERVER_BIN:-llama-server}"

if ! command -v "$server_bin" >/dev/null 2>&1; then
  echo "llama-server was not found. Set LLAMA_SERVER_BIN to its executable path." >&2
  exit 1
fi
if [[ ! -f "$model_path" ]]; then
  echo "Model not found: $model_path" >&2
  exit 1
fi

exec "$server_bin" -m "$model_path" --host 127.0.0.1 --port 8080 -c 4096

