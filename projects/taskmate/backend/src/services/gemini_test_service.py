import os


def _local_stub_response(prompt: str) -> str:
    # Minimal fallback so UI flow continues when provider cannot answer.
    text = (prompt or "").strip()
    if not text:
        return "I did not receive a prompt."
    return f"[Local fallback] I received your prompt: {text}"


def _clean_model_name(name: str) -> str:
    # SDK list_models may return "models/<name>"; generate_content expects "<name>".
    return name.split("/", 1)[1] if name.startswith("models/") else name


def _resolve_model_candidates(client) -> list[str]:
    configured = os.getenv("GEMINI_MODEL", "").strip()
    if configured:
        return [configured]

    preferred = [
        "gemini-3-flash-preview",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-3-flash",
        "gemini-1.5-flash",
    ]
    try:
        available = []
        for model in client.models.list():
            name = _clean_model_name(getattr(model, "name", "") or "")
            methods = getattr(model, "supported_generation_methods", None) or []
            if name and "generateContent" in methods:
                available.append(name)
        if not available:
            return preferred

        ordered = [name for name in preferred if name in available]
        tail = [name for name in available if name not in ordered]
        return ordered + tail
    except Exception:
        return preferred


def generate_test_response(prompt: str) -> tuple[str, str]:
    """
    Returns (response_text, status).
    status:
      - completed
      - local_fallback
    """
    cleaned_prompt = (prompt or "").strip()
    if not cleaned_prompt:
        return "Prompt is empty.", "local_fallback"

    api_key = os.getenv("GEMINI_API_KEY", "").strip()

    if not api_key:
        return _local_stub_response(cleaned_prompt), "local_fallback"

    try:
        from google import genai

        client = genai.Client(api_key=api_key)
        for model_name in _resolve_model_candidates(client):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=cleaned_prompt,
                )

                text = getattr(response, "text", None)
                if isinstance(text, str) and text.strip():
                    return text.strip(), "completed"

                candidates = getattr(response, "candidates", None) or []
                for candidate in candidates:
                    content = getattr(candidate, "content", None)
                    parts = getattr(content, "parts", None) or []
                    collected = []
                    for part in parts:
                        part_text = getattr(part, "text", None)
                        if isinstance(part_text, str) and part_text.strip():
                            collected.append(part_text.strip())
                    if collected:
                        return "\n".join(collected).strip(), "completed"
            except Exception:
                continue
        return _local_stub_response(cleaned_prompt), "local_fallback"
    except Exception:
        return _local_stub_response(cleaned_prompt), "local_fallback"
