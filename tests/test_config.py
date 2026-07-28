from __future__ import annotations

from app.config import get_settings


def test_standalone_environment_takes_precedence(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("LOCAL_SEARCH_HOST", "0.0.0.0")
    monkeypatch.setenv("LOCAL_SEARCH_PORT", "19090")
    monkeypatch.setenv("LOCAL_SEARCH_CACHE_PATH", str(tmp_path / "standalone.sqlite3"))
    monkeypatch.setenv("LOCAL_SEARCH_ALLOWED_ORIGINS", "https://app.example")
    monkeypatch.setenv(
        "LOCAL_SEARCH_ADDITIONAL_ORIGINS",
        "https://preview.example,https://app.example",
    )
    monkeypatch.setenv("LOCAL_SEARCH_ALLOWED_HOSTS", "search.example,localhost")
    monkeypatch.setenv("STUDYSTUDIO_PORT", "18080")
    get_settings.cache_clear()
    try:
        settings = get_settings()
        assert settings.host == "0.0.0.0"
        assert settings.port == 19090
        assert settings.cache_path == tmp_path / "standalone.sqlite3"
        assert settings.allowed_origins == (
            "https://app.example",
            "https://preview.example",
        )
        assert settings.allowed_hosts == ("search.example", "localhost")
    finally:
        get_settings.cache_clear()
