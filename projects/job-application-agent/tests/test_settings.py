from pathlib import Path

from app.core.settings import load_settings


def test_settings_load_expected_model() -> None:
    settings = load_settings(Path(__file__).parents[1])
    assert settings.llama_model_path.name == "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
    assert settings.config.approval.require_human_submission_approval is True

