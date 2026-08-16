$ErrorActionPreference = "Stop"

if (-not $env:LLAMA_MODEL) {
    throw "Set LLAMA_MODEL to an absolute .gguf model path."
}

$server = if ($env:LLAMA_SERVER_BIN) { $env:LLAMA_SERVER_BIN } else { "llama-server" }
$port = if ($env:LLAMA_PORT) { $env:LLAMA_PORT } else { "8080" }
$context = if ($env:LLAMA_CONTEXT) { $env:LLAMA_CONTEXT } else { "8192" }
$gpuLayers = if ($env:LLAMA_GPU_LAYERS) { $env:LLAMA_GPU_LAYERS } else { "0" }
$cors = if ($env:LLAMA_CORS_ORIGINS) { $env:LLAMA_CORS_ORIGINS } else { "localhost" }

$arguments = @(
    "-m", $env:LLAMA_MODEL,
    "--host", "127.0.0.1",
    "--port", $port,
    "-c", $context,
    "--n-gpu-layers", $gpuLayers,
    "--cors-origins", $cors
)

if ($env:LLAMA_MMPROJ) {
    $arguments += @("--mmproj", $env:LLAMA_MMPROJ)
}

if ($env:LLAMA_API_KEY) {
    $arguments += @("--api-key", $env:LLAMA_API_KEY)
}

& $server @arguments
exit $LASTEXITCODE
