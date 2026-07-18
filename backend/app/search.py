from __future__ import annotations

import hashlib
import html
import re
from typing import Any

import httpx

from .cache import CacheStore
from .config import Settings


TAG_RE = re.compile(r"<[^>]+>")


class SearchServiceError(RuntimeError):
    pass


def _clip(value: Any, maximum: int) -> str:
    text = TAG_RE.sub(" ", html.unescape(str(value or "")))
    text = " ".join(text.split())
    return text if len(text) <= maximum else text[:maximum] + "…"


def _cache_key(kind: str, query: str, limit: int) -> str:
    value = f"{kind}\0{query.strip().casefold()}\0{limit}".encode("utf-8")
    return hashlib.sha256(value).hexdigest()


class SearchService:
    def __init__(self, settings: Settings, cache: CacheStore) -> None:
        self._settings = settings
        self._cache = cache
        self._client = httpx.AsyncClient(
            base_url=settings.searxng_url,
            timeout=httpx.Timeout(settings.request_timeout_seconds),
            follow_redirects=False,
            trust_env=settings.trust_environment_proxy,
            headers={
                "User-Agent": "StudyStudio-Local/1.0",
                "X-Forwarded-For": "127.0.0.1",
                "X-Real-IP": "127.0.0.1",
            },
        )

    async def search(self, query: str, limit: int, images: bool = False) -> dict[str, Any]:
        q = query.strip()
        if not q:
            raise SearchServiceError("缺少搜索关键词 query")
        kind = "images" if images else "general"
        key = _cache_key(kind, q, limit)
        cached = self._cache.get("search", key)
        if cached is not None:
            cached["cached"] = True
            return cached

        form = {
            "q": q,
            "format": "json",
            "categories": "images" if images else "general",
            "language": "auto",
            "safesearch": "1",
        }
        try:
            response = await self._client.post("/search", data=form)
        except httpx.TimeoutException as exc:
            raise SearchServiceError(f"本地搜索超时（{self._settings.request_timeout_seconds}s）") from exc
        except httpx.HTTPError as exc:
            raise SearchServiceError("无法连接本地 SearXNG，请确认 Docker 服务已启动") from exc
        if response.status_code == 403:
            raise SearchServiceError("SearXNG 未启用 JSON 输出，请检查 backend/searxng/settings.yml")
        if response.is_error:
            raise SearchServiceError(f"SearXNG 搜索失败: HTTP {response.status_code}")
        try:
            payload = response.json()
        except ValueError as exc:
            raise SearchServiceError("SearXNG 返回了无效 JSON") from exc

        raw_results = payload.get("results") if isinstance(payload, dict) else []
        if not isinstance(raw_results, list):
            raw_results = []
        seen: set[str] = set()
        results: list[dict[str, str]] = []
        for item in raw_results:
            if not isinstance(item, dict):
                continue
            if images:
                image_url = str(item.get("img_src") or item.get("thumbnail_src") or "").strip()
                source_url = str(item.get("url") or "").strip()
                dedupe_key = image_url
                if not image_url:
                    continue
                normalized = {
                    "title": _clip(item.get("title"), 300) or "(无标题)",
                    "imageUrl": image_url,
                    "sourceUrl": source_url,
                }
            else:
                url = str(item.get("url") or "").strip()
                dedupe_key = url
                if not url:
                    continue
                normalized = {
                    "title": _clip(item.get("title"), 300) or "(无标题)",
                    "url": url,
                    "snippet": _clip(item.get("content"), 400),
                }
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            results.append(normalized)
            if len(results) >= limit:
                break

        output: dict[str, Any] = {
            "query": q,
            "count": len(results),
            "results": results,
            "backend": "local-searxng",
        }
        if not results:
            output["message"] = "未找到相关结果。可尝试更换关键词。"
        self._cache.set("search", key, output, self._settings.search_cache_ttl_seconds)
        return output

    async def health(self) -> bool:
        try:
            response = await self._client.get("/", timeout=3.0)
            return not response.is_error
        except httpx.HTTPError:
            return False

    async def close(self) -> None:
        await self._client.aclose()
