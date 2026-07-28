from __future__ import annotations

from dataclasses import replace

import httpx
import pytest

from app.cache import CacheStore
from app.config import get_settings
from app.search import SearchService, SearchServiceError


@pytest.mark.asyncio
async def test_search_normalizes_deduplicates_and_caches(tmp_path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert request.method == "POST"
        assert request.url.path == "/search"
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "title": "<b>First</b>",
                        "url": "https://example.com/first",
                        "content": "  useful   result  ",
                    },
                    {
                        "title": "Duplicate",
                        "url": "https://example.com/first",
                        "content": "ignored",
                    },
                    {
                        "title": "Second",
                        "url": "https://example.com/second",
                        "content": "another result",
                    },
                ]
            },
        )

    cache = CacheStore(tmp_path / "cache.sqlite3")
    settings = replace(get_settings(), cache_path=tmp_path / "cache.sqlite3")
    service = SearchService(settings, cache)
    await service._client.aclose()
    service._client = httpx.AsyncClient(
        base_url=settings.searxng_url,
        transport=httpx.MockTransport(handler),
    )
    try:
        first = await service.search("  local search  ", 5)
        second = await service.search("local search", 5)
    finally:
        await service.close()
        cache.close()

    assert calls == 1
    assert first["query"] == "local search"
    assert first["count"] == 2
    assert first["results"][0] == {
        "title": "First",
        "url": "https://example.com/first",
        "snippet": "useful result",
    }
    assert second["cached"] is True


@pytest.mark.asyncio
async def test_search_reports_disabled_json_output(tmp_path) -> None:
    cache = CacheStore(tmp_path / "cache.sqlite3")
    settings = replace(get_settings(), cache_path=tmp_path / "cache.sqlite3")
    service = SearchService(settings, cache)
    await service._client.aclose()
    service._client = httpx.AsyncClient(
        base_url=settings.searxng_url,
        transport=httpx.MockTransport(lambda _request: httpx.Response(403)),
    )
    try:
        with pytest.raises(SearchServiceError, match="searxng/settings.yml"):
            await service.search("query", 5)
    finally:
        await service.close()
        cache.close()
