"""Small OpenAI-compatible client for the local llama.cpp server."""

from __future__ import annotations

import json
from typing import Any, TypeVar

import requests
from pydantic import BaseModel, ValidationError

ModelT = TypeVar("ModelT", bound=BaseModel)


class LocalModelError(RuntimeError):
    """Raised when the local model cannot return a validated response."""


class LocalLLMClient:
    def __init__(self, base_url: str, timeout_seconds: int = 180) -> None:
        self.endpoint = f"{base_url.rstrip('/')}/v1/chat/completions"
        self.timeout_seconds = timeout_seconds

    def is_available(self) -> bool:
        try:
            response = requests.get(self.endpoint.rsplit("/v1", 1)[0] + "/health", timeout=2)
            return response.ok
        except requests.RequestException:
            return False

    def complete(
        self,
        system: str,
        user: str,
        temperature: float = 0.3,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        payload = {
            "model": "local-model",
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": temperature,
            "max_tokens": 1800,
        }
        if response_format:
            payload["response_format"] = response_format
        try:
            response = requests.post(self.endpoint, json=payload, timeout=self.timeout_seconds)
            response.raise_for_status()
            return str(response.json()["choices"][0]["message"]["content"])
        except (requests.RequestException, KeyError, TypeError, ValueError) as error:
            raise LocalModelError(f"Local model request failed: {error}") from error

    def structured(self, system: str, user: str, model_type: type[ModelT]) -> ModelT:
        schema = json.dumps(model_type.model_json_schema(), indent=2)
        instruction = f"{system}\nReturn only valid JSON matching this schema:\n{schema}"
        response_format = {
            "type": "json_schema",
            "json_schema": {"name": model_type.__name__, "schema": model_type.model_json_schema()},
        }
        first = self.complete(instruction, user, temperature=0.1, response_format=response_format)
        try:
            return model_type.model_validate(self._decode_json(first))
        except (ValidationError, json.JSONDecodeError) as first_error:
            repair = self.complete(
                instruction,
                f"Repair this invalid response. Return JSON only.\n\n{first}",
                temperature=0.1,
                response_format=response_format,
            )
            try:
                return model_type.model_validate(self._decode_json(repair))
            except (ValidationError, json.JSONDecodeError) as error:
                raise LocalModelError(f"Model returned invalid JSON after one retry: {error}") from first_error

    @staticmethod
    def _decode_json(content: str) -> Any:
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
            if cleaned.lstrip().startswith("json"):
                cleaned = cleaned.lstrip()[4:].lstrip()
        return json.loads(cleaned)
