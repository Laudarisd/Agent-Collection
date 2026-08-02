# Local LLM Model Setup

A clean setup guide for running the job-application model locally with
`llama.cpp`.

This setup does not require an NVIDIA GPU or any cloud API.

---

## 1. System Used

```text
Device: MacBook Pro
Chip: Apple M1 Pro
Memory: 16 GB
Runtime: llama.cpp
Model: Qwen3-4B-Instruct-2507
Model format: GGUF
Quantization: Q4_K_M
Deployment: Fully local
```

Apple Silicon can use Metal acceleration through its integrated GPU. This is
still a fully local setup.

---

## 2. Expected Resource Usage

| Component | Approximate size |
|---|---:|
| `llama.cpp` | Less than 300 MB |
| Model file | About 2.3–2.5 GB |
| Python environment | About 300–600 MB |
| Normal model memory use | About 4–6 GB |

Recommended free disk space:

```text
At least 6 GB
```

---

## 3. Install llama.cpp

Check Homebrew:

```bash
brew --version
```

Install `llama.cpp`:

```bash
brew update
brew install llama.cpp
```

Verify:

```bash
llama-cli --version
llama-server --version
which llama-cli
which llama-server
```

Expected executable paths:

```text
/opt/homebrew/bin/llama-cli
/opt/homebrew/bin/llama-server
```

---

## 4. Create the Project Folder

```bash
cd ~/Desktop/workspace/projects
mkdir -p agent_to_apply_job
cd agent_to_apply_job
```

Create the main folders:

```bash
mkdir -p models logs app scripts data
```

Check:

```bash
ls
```

Expected:

```text
app
data
logs
models
scripts
```

---

## 5. Download the Model

Run:

```bash
curl -L --progress-bar \
  -o models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf \
  "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf?download=true"
```

Check the file:

```bash
ls -lh models
```

Expected model:

```text
models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
```

---

## 6. Run the Model

### Recommended Apple Silicon mode

This uses Apple Metal acceleration.

```bash
llama-cli \
  -m models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf \
  -c 4096 \
  -ngl all \
  -cnv \
  --temp 0.2
```

### Strict CPU-only mode

```bash
llama-cli \
  -m models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf \
  -c 4096 \
  -ngl 0 \
  -cnv \
  --temp 0.2
```

The strict CPU-only mode is slower. For an M1 Pro, Metal mode is recommended.

---

## 7. Test the Model

When the prompt shows:

```text
>
```

Paste:

```text
Return valid JSON only.

Extract the following job information:

ABC Engineering is hiring a Machine Learning Engineer in Sydney, Australia.
The position requires Python, PyTorch, computer vision, and three years of
machine-learning experience. ONNX and Docker are preferred.

Return:
- job_title
- company
- city
- country
- required_skills
- preferred_skills
- required_experience_years
```

Expected structure:

```json
{
  "job_title": "Machine Learning Engineer",
  "company": "ABC Engineering",
  "city": "Sydney",
  "country": "Australia",
  "required_skills": [
    "Python",
    "PyTorch",
    "computer vision"
  ],
  "preferred_skills": [
    "ONNX",
    "Docker"
  ],
  "required_experience_years": 3
}
```

Exit:

```text
/exit
```

---

## 8. Start the Local API Server

The job agent should communicate with `llama-server`.

### Recommended mode

```bash
llama-server \
  -m models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf \
  --host 127.0.0.1 \
  --port 8080 \
  -c 4096 \
  -ngl all
```

### Strict CPU-only mode

```bash
llama-server \
  -m models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf \
  --host 127.0.0.1 \
  --port 8080 \
  -c 4096 \
  -ngl 0
```

Keep this Terminal window open.

Local server:

```text
http://127.0.0.1:8080
```

Chat endpoint:

```text
http://127.0.0.1:8080/v1/chat/completions
```

---

## 9. Check Server Health

Open another Terminal:

```bash
curl http://127.0.0.1:8080/health
```

Expected:

```json
{"status":"ok"}
```

---

## 10. Test the API

```bash
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "Extract factual job information. Never invent missing information. Return JSON only."
      },
      {
        "role": "user",
        "content": "Extract the job title, city, country, and required skills from: Machine Learning Engineer in Sydney, Australia requiring Python, PyTorch, and computer vision."
      }
    ],
    "temperature": 0,
    "max_tokens": 300
  }'
```

A successful response confirms that the model is ready for the Python project.

---

## 11. Create the Environment File

Create:

```text
.env
```

Add:

```env
LLM_MODEL_PATH=models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
LLM_HOST=127.0.0.1
LLM_PORT=8080
LLM_BASE_URL=http://127.0.0.1:8080
LLM_CONTEXT_SIZE=4096
LLM_GPU_LAYERS=all
LLM_SERVER_LOG=logs/llama-server.log
```

For strict CPU-only mode:

```env
LLM_GPU_LAYERS=0
```

---

## 12. Create the Run Script

Create:

```text
scripts/run_llm.sh
```

Add:

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if [[ -f ".env" ]]; then
  set -a
  source .env
  set +a
fi

MODEL_PATH="${LLM_MODEL_PATH:-models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf}"
LLM_HOST="${LLM_HOST:-127.0.0.1}"
LLM_PORT="${LLM_PORT:-8080}"
CONTEXT_SIZE="${LLM_CONTEXT_SIZE:-4096}"
GPU_LAYERS="${LLM_GPU_LAYERS:-all}"

if [[ ! -f "$MODEL_PATH" ]]; then
  echo "Model file not found: $MODEL_PATH"
  exit 1
fi

exec llama-server \
  -m "$MODEL_PATH" \
  --host "$LLM_HOST" \
  --port "$LLM_PORT" \
  -c "$CONTEXT_SIZE" \
  -ngl "$GPU_LAYERS"
```

Make it executable:

```bash
chmod +x scripts/run_llm.sh
```

Run:

```bash
./scripts/run_llm.sh
```

---

## 13. Recommended Initial Settings

```text
Context size: 4096
Extraction temperature: 0.1
Writing temperature: 0.3
Maximum output tokens: 1000–1800
Quantization: Q4_K_M
```

Keep the context at 4096 initially to reduce memory use.

---

## 14. Stop the Server

Return to the Terminal running `llama-server` and press:

```text
Control + C
```

The model will stop using active memory, but the model file remains on disk.

---

## 15. Common Problems

### Command not found

```bash
brew install llama.cpp
```

### Model not found

```bash
pwd
ls -lh models
```

### Port 8080 already in use

```bash
lsof -i :8080
```

Then stop the process:

```bash
kill <PROCESS_ID>
```

### Model is slow

Use:

```text
-ngl all
```

or reduce context:

```text
-c 2048
```

### Invalid JSON response

Add this instruction:

```text
Return valid JSON only.
Do not include Markdown or explanations.
Use null for unknown values.
```

---

## Final Setup

```text
Runtime: llama.cpp
Model: Qwen3-4B-Instruct-2507
Format: GGUF
Quantization: Q4_K_M
Context: 4096
Server: http://127.0.0.1:8080
NVIDIA GPU: Not required
Cloud API: Not required
```

Start the model with:

```bash
./scripts/run_llm.sh
```
