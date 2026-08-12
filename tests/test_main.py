from dataclasses import replace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.config import get_settings
from app.extractor import ExtractionService
from app.main import app, create_app
from app.search import SearchService


client = TestClient(app)


def test_root_describes_api_only_service() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["service"] == "Local Search Service"


def test_configured_origin_can_request_private_network_access(tmp_path) -> None:
    settings = replace(
        get_settings(),
        cache_path=tmp_path / "cache.sqlite3",
        allowed_origins=("https://app.example",),
    )
    configured_client = TestClient(create_app(settings))
    response = configured_client.options(
        "/api/web/search",
        headers={
            "Origin": "https://app.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
            "Access-Control-Request-Private-Network": "true",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://app.example"
    assert response.headers["access-control-allow-private-network"] == "true"


def test_unknown_browser_origin_is_rejected() -> None:
    response = client.get("/api/health", headers={"Origin": "https://evil.example"})

    assert response.status_code == 403


def test_health_reports_degraded_when_searxng_is_unavailable(tmp_path) -> None:
    settings = replace(get_settings(), cache_path=tmp_path / "cache.sqlite3")
    with patch.object(SearchService, "health", AsyncMock(return_value=False)):
        with TestClient(create_app(settings)) as lifecycle_client:
            response = lifecycle_client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "degraded",
        "gateway": True,
        "searxng": False,
        "browser_fallback": settings.enable_browser_fallback,
    }


def test_web_search_route_preserves_api_contract(tmp_path) -> None:
    settings = replace(get_settings(), cache_path=tmp_path / "cache.sqlite3")
    result = {"query": "portable search", "count": 0, "results": []}
    search_mock = AsyncMock(return_value=result)
    with patch.object(SearchService, "search", search_mock):
        with TestClient(create_app(settings)) as lifecycle_client:
            response = lifecycle_client.post(
                "/api/web/search",
                json={"query": "portable search", "max_results": 4},
            )

    assert response.status_code == 200
    assert response.json() == result
    search_mock.assert_awaited_once_with("portable search", 4)


def test_web_search_get_avoids_mobile_cors_preflight(tmp_path) -> None:
    settings = replace(get_settings(), cache_path=tmp_path / "cache.sqlite3")
    result = {"query": "phone search", "count": 1, "results": [{"url": "https://example.com"}]}
    search_mock = AsyncMock(return_value=result)
    with patch.object(SearchService, "search", search_mock):
        with TestClient(create_app(settings)) as lifecycle_client:
            response = lifecycle_client.get(
                "/api/web/search",
                params={"query": "phone search", "max_results": 3},
                headers={"Origin": settings.allowed_origins[0]},
            )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == settings.allowed_origins[0]
    assert response.json() == result
    search_mock.assert_awaited_once_with("phone search", 3)


def test_image_search_route_selects_image_category(tmp_path) -> None:
    settings = replace(get_settings(), cache_path=tmp_path / "cache.sqlite3")
    search_mock = AsyncMock(return_value={"query": "diagram", "count": 0, "results": []})
    with patch.object(SearchService, "search", search_mock):
        with TestClient(create_app(settings)) as lifecycle_client:
            response = lifecycle_client.post(
                "/api/web/images",
                json={"query": "diagram", "max_results": 6},
            )

    assert response.status_code == 200
    search_mock.assert_awaited_once_with("diagram", 6, images=True)


def test_extract_route_preserves_api_contract(tmp_path) -> None:
    settings = replace(get_settings(), cache_path=tmp_path / "cache.sqlite3")
    result = {
        "url": "https://example.com/article",
        "title": "Example",
        "content": "Body",
    }
    extract_mock = AsyncMock(return_value=result)
    with patch.object(ExtractionService, "extract", extract_mock):
        with TestClient(create_app(settings)) as lifecycle_client:
            response = lifecycle_client.post(
                "/api/web/extract",
                json={"url": "https://example.com/article", "max_chars": 5000},
            )

    assert response.status_code == 200
    assert response.json() == result
    extract_mock.assert_awaited_once_with("https://example.com/article", 5000)


def test_extract_get_avoids_mobile_cors_preflight(tmp_path) -> None:
    settings = replace(get_settings(), cache_path=tmp_path / "cache.sqlite3")
    result = {"url": "https://example.com/article", "title": "Example", "content": "Body"}
    extract_mock = AsyncMock(return_value=result)
    with patch.object(ExtractionService, "extract", extract_mock):
        with TestClient(create_app(settings)) as lifecycle_client:
            response = lifecycle_client.get(
                "/api/web/extract",
                params={"url": "https://example.com/article", "max_chars": 5000},
                headers={"Origin": settings.allowed_origins[0]},
            )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == settings.allowed_origins[0]
    assert response.json() == result
    extract_mock.assert_awaited_once_with("https://example.com/article", 5000)
