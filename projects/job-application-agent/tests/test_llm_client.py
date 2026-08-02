import pytest
from pydantic import BaseModel

from app.services.llm_client import LocalLLMClient, LocalModelError


class Answer(BaseModel):
    value: int


def test_structured_parses_fenced_json(monkeypatch: pytest.MonkeyPatch) -> None:
    client = LocalLLMClient("http://localhost:8080")
    monkeypatch.setattr(client, "complete", lambda *args, **kwargs: "```json\n{\"value\": 3}\n```")
    assert client.structured("system", "user", Answer).value == 3


def test_structured_retries_once_then_stops(monkeypatch: pytest.MonkeyPatch) -> None:
    client = LocalLLMClient("http://localhost:8080")
    calls = 0

    def invalid(*args, **kwargs):
        nonlocal calls
        calls += 1
        return "not json"

    monkeypatch.setattr(client, "complete", invalid)
    with pytest.raises(LocalModelError):
        client.structured("system", "user", Answer)
    assert calls == 2

