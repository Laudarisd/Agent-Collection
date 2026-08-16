#!/usr/bin/env bash
set -euo pipefail

: "${LLAMA_MODEL:?Set LLAMA_MODEL to an absolute .gguf model path}"

LLAMA_SERVER_BIN="${LLAMA_SERVER_BIN:-llama-server}"
LLAMA_PORT="${LLAMA_PORT:-8080}"
LLAMA_CONTEXT="${LLAMA_CONTEXT:-8192}"
LLAMA_GPU_LAYERS="${LLAMA_GPU_LAYERS:-0}"
LLAMA_CORS_ORIGINS="${LLAMA_CORS_ORIGINS:-localhost}"

args=(
  -m "$LLAMA_MODEL"
  --host 127.0.0.1
  --port "$LLAMA_PORT"
  -c "$LLAMA_CONTEXT"
  --n-gpu-layers "$LLAMA_GPU_LAYERS"
  --cors-origins "$LLAMA_CORS_ORIGINS"
)

if [[ -n "${LLAMA_MMPROJ:-}" ]]; then
  args+=(--mmproj "$LLAMA_MMPROJ")
fi

if [[ -n "${LLAMA_API_KEY:-}" ]]; then
  args+=(--api-key "$LLAMA_API_KEY")
fi

exec "$LLAMA_SERVER_BIN" "${args[@]}"
