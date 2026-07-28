from __future__ import annotations

import asyncio
import hashlib
import html
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin

import httpx
import trafilatura

from .cache import CacheStore
from .config import Settings
from .security import UrlPolicyError, validate_browser_request, validate_public_url


REDIRECT_STATUSES = {301, 302, 303, 307, 308}
ALLOWED_CONTENT_TYPES = {"text/html", "application/xhtml+xml", "text/plain"}
IMAGE_RE = re.compile(r"!\[[^\]]*\]\((https?://[^\s)]+)\)", re.IGNORECASE)
HTML_IMAGE_RE = re.compile(r"<img[^>]+src=[\"']([^\"']+)[\"']", re.IGNORECASE)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)


class ExtractionError(RuntimeError):
    pass


@dataclass
class DownloadedPage:
    url: str
    body: bytes
    content_type: str


def _cache_key(url: str) -> str:
    return hashlib.sha256(url.strip().encode("utf-8")).hexdigest()


def _decode_text(body: bytes) -> str:
    for encoding in ("utf-8", "gb18030", "big5", "latin-1"):
        try:
            return body.decode(encoding)
        except UnicodeDecodeError:
            continue
    return body.decode("utf-8", errors="replace")


def _extract_images(source: str, page_url: str, maximum: int = 20) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for pattern in (IMAGE_RE, HTML_IMAGE_RE):
        for match in pattern.finditer(source):
            candidate = urljoin(page_url, match.group(1).strip())
            if not candidate.lower().startswith(("http://", "https://")) or candidate in seen:
                continue
            seen.add(candidate)
            output.append(candidate)
            if len(output) >= maximum:
                return output
    return output


def _extract_static(body: bytes, page_url: str, content_type: str) -> tuple[str, str, list[str]]:
    decoded = _decode_text(body)
    if content_type == "text/plain":
        content = decoded.strip()
        return "", content, []

    title_match = TITLE_RE.search(decoded)
    title = html.unescape(" ".join(title_match.group(1).split())).strip() if title_match else ""
    metadata = trafilatura.extract_metadata(body)
    if not title:
        title = str(getattr(metadata, "title", "") or "").strip()
    content = trafilatura.extract(
        body,
        url=page_url,
        output_format="markdown",
        include_comments=False,
        include_links=True,
        include_images=True,
        include_tables=True,
        include_formatting=True,
        favor_recall=True,
    )
    if not content:
        content = trafilatura.html2txt(body)
    content = (content or "").strip()
    images = _extract_images(f"{decoded}\n{content}", page_url)
    return title, content, images


class BrowserRenderer:
    """Lazy Playwright renderer used only when static extraction is insufficient."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._playwright: Any | None = None
        self._browser: Any | None = None
        self._startup_lock = asyncio.Lock()

    async def _ensure_browser(self) -> Any:
        if self._browser is not None:
            return self._browser
        async with self._startup_lock:
            if self._browser is not None:
                return self._browser
            try:
                from playwright.async_api import async_playwright

                self._playwright = await async_playwright().start()
                self._browser = await self._playwright.chromium.launch(headless=True)
            except Exception as exc:
                if self._playwright is not None:
                    await self._playwright.stop()
                self._playwright = None
                raise ExtractionError(
                    "页面需要浏览器渲染，但 Playwright Chromium 尚未安装；请运行 python -m playwright install chromium"
                ) from exc
        return self._browser

    async def render(self, url: str) -> DownloadedPage:
        browser = await self._ensure_browser()
        context = await browser.new_context(
            java_script_enabled=True,
            service_workers="block",
            ignore_https_errors=False,
        )
        page = await context.new_page()

        async def guard_route(route: Any, request: Any) -> None:
            if request.resource_type in {"image", "media", "font"}:
                await route.abort()
                return
            if await validate_browser_request(request.url):
                await route.continue_()
            else:
                await route.abort()

        await page.route("**/*", guard_route)
        try:
            await page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=self._settings.browser_timeout_seconds * 1000,
            )
            try:
                await page.wait_for_load_state("networkidle", timeout=3_000)
            except Exception:
                pass
            final_url = await validate_public_url(page.url)
            body = (await page.content()).encode("utf-8")
            if len(body) > self._settings.max_download_bytes:
                raise ExtractionError("浏览器渲染后的页面超过允许的大小")
            return DownloadedPage(final_url, body, "text/html")
        finally:
            await context.close()

    async def close(self) -> None:
        if self._browser is not None:
            await self._browser.close()
            self._browser = None
        if self._playwright is not None:
            await self._playwright.stop()
            self._playwright = None


class ExtractionService:
    def __init__(self, settings: Settings, cache: CacheStore) -> None:
        self._settings = settings
        self._cache = cache
        self._renderer = BrowserRenderer(settings)
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.request_timeout_seconds),
            follow_redirects=False,
            trust_env=settings.trust_environment_proxy,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; LocalSearchService/1.0; +http://localhost)",
                "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
            },
        )

    async def _download(self, url: str) -> DownloadedPage:
        current = await validate_public_url(url)
        for _ in range(6):
            try:
                async with self._client.stream("GET", current) as response:
                    if response.status_code in REDIRECT_STATUSES:
                        location = response.headers.get("location")
                        if not location:
                            raise ExtractionError("网页返回了缺少 Location 的重定向")
                        current = await validate_public_url(urljoin(current, location))
                        continue
                    if response.is_error:
                        raise ExtractionError(f"读取网页失败: HTTP {response.status_code}")
                    content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
                        raise ExtractionError(f"不支持的网页类型: {content_type}")
                    chunks: list[bytes] = []
                    size = 0
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > self._settings.max_download_bytes:
                            raise ExtractionError(
                                f"网页超过下载上限 {self._settings.max_download_bytes // (1024 * 1024)} MB"
                            )
                        chunks.append(chunk)
                    return DownloadedPage(str(response.url), b"".join(chunks), content_type or "text/html")
            except httpx.TimeoutException as exc:
                raise ExtractionError(f"读取网页超时（{self._settings.request_timeout_seconds}s）") from exc
            except httpx.HTTPError as exc:
                raise ExtractionError(f"读取网页出错: {exc}") from exc
        raise ExtractionError("网页重定向次数过多")

    async def extract(self, url: str, max_chars: int) -> dict[str, Any]:
        target = url.strip()
        if not target.lower().startswith(("http://", "https://")):
            target = f"https://{target}"
        await validate_public_url(target)
        key = _cache_key(target)
        cached = self._cache.get("extract", key)
        if cached is not None:
            return self._format_result(cached, max_chars, cached=True)

        page = await self._download(target)
        title, content, images = await asyncio.to_thread(
            _extract_static,
            page.body,
            page.url,
            page.content_type,
        )
        rendered = False
        if len(content) < 200 and self._settings.enable_browser_fallback and page.content_type != "text/plain":
            rendered_page = await self._renderer.render(page.url)
            title, content, images = await asyncio.to_thread(
                _extract_static,
                rendered_page.body,
                rendered_page.url,
                rendered_page.content_type,
            )
            page = rendered_page
            rendered = True
        if not content:
            raise ExtractionError("页面正文为空，可能是登录页、付费墙、验证码页或被目标站点屏蔽")

        stored = {
            "url": page.url,
            "title": title,
            "content": content,
            "images": images,
            "rendered": rendered,
        }
        self._cache.set("extract", key, stored, self._settings.extract_cache_ttl_seconds)
        return self._format_result(stored, max_chars, cached=False)

    @staticmethod
    def _format_result(stored: dict[str, Any], max_chars: int, cached: bool) -> dict[str, Any]:
        full_content = str(stored.get("content") or "")
        clipped = full_content[:max_chars]
        output: dict[str, Any] = {
            "url": stored.get("url") or "",
            "title": stored.get("title") or "",
            "content": clipped,
            "chars": len(clipped),
            "full_chars": len(full_content),
            "truncated": len(full_content) > max_chars,
            "backend": "local",
            "rendered": bool(stored.get("rendered")),
            "cached": cached,
        }
        images = stored.get("images")
        if isinstance(images, list) and images:
            output["images"] = images[:20]
        return output

    async def close(self) -> None:
        await self._client.aclose()
        await self._renderer.close()
