from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .cache import CacheStore
from .config import Settings, get_settings
from .extractor import ExtractionError, ExtractionService
from .models import ExtractRequest, SearchRequest
from .search import SearchService, SearchServiceError
from .security import UrlPolicyError


def create_app(settings: Settings | None = None) -> FastAPI:
    service_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        cache = CacheStore(service_settings.cache_path)
        cache.purge_expired()
        app.state.cache = cache
        app.state.search = SearchService(service_settings, cache)
        app.state.extractor = ExtractionService(service_settings, cache)
        try:
            yield
        finally:
            await app.state.search.close()
            await app.state.extractor.close()
            cache.close()

    app = FastAPI(
        title="Local Search Service",
        description="Local-first web search, image search, and safe webpage extraction API.",
        version=__version__,
        lifespan=lifespan,
    )
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=list(service_settings.allowed_hosts),
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(service_settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
        allow_private_network=True,
    )

    @app.middleware("http")
    async def protect_local_api(request: Request, call_next):
        origin = request.headers.get("origin")
        if (
            request.url.path.startswith("/api/")
            and origin
            and origin not in service_settings.allowed_origins
        ):
            return JSONResponse(
                status_code=403,
                content={"error": "该网页来源不在本地搜索服务的允许列表中"},
            )
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response

    @app.get("/api/health")
    async def health(request: Request) -> dict[str, object]:
        searxng_ready = await request.app.state.search.health()
        return {
            "status": "ok" if searxng_ready else "degraded",
            "gateway": True,
            "searxng": searxng_ready,
            "browser_fallback": service_settings.enable_browser_fallback,
        }

    @app.post("/api/web/search")
    async def web_search(payload: SearchRequest, request: Request):
        try:
            return await request.app.state.search.search(payload.query, payload.max_results)
        except SearchServiceError as exc:
            return JSONResponse(status_code=502, content={"error": str(exc), "query": payload.query})

    @app.get("/api/web/search")
    async def web_search_get(
        request: Request,
        query: str = Query(min_length=1, max_length=500),
        max_results: int = Query(default=5, ge=1, le=10),
    ):
        try:
            return await request.app.state.search.search(query, max_results)
        except SearchServiceError as exc:
            return JSONResponse(status_code=502, content={"error": str(exc), "query": query})

    @app.post("/api/web/images")
    async def image_search(payload: SearchRequest, request: Request):
        try:
            return await request.app.state.search.search(payload.query, payload.max_results, images=True)
        except SearchServiceError as exc:
            return JSONResponse(status_code=502, content={"error": str(exc), "query": payload.query})

    @app.get("/api/web/images")
    async def image_search_get(
        request: Request,
        query: str = Query(min_length=1, max_length=500),
        max_results: int = Query(default=5, ge=1, le=10),
    ):
        try:
            return await request.app.state.search.search(query, max_results, images=True)
        except SearchServiceError as exc:
            return JSONResponse(status_code=502, content={"error": str(exc), "query": query})

    @app.post("/api/web/extract")
    async def extract_url(payload: ExtractRequest, request: Request):
        try:
            return await request.app.state.extractor.extract(payload.url, payload.max_chars)
        except UrlPolicyError as exc:
            return JSONResponse(status_code=400, content={"error": str(exc), "url": payload.url})
        except ExtractionError as exc:
            return JSONResponse(status_code=502, content={"error": str(exc), "url": payload.url})

    @app.get("/api/web/extract")
    async def extract_url_get(
        request: Request,
        url: str = Query(min_length=1, max_length=4096),
        max_chars: int = Query(default=16_000, ge=1_000, le=40_000),
    ):
        try:
            return await request.app.state.extractor.extract(url, max_chars)
        except UrlPolicyError as exc:
            return JSONResponse(status_code=400, content={"error": str(exc), "url": url})
        except ExtractionError as exc:
            return JSONResponse(status_code=502, content={"error": str(exc), "url": url})

    @app.get("/", include_in_schema=False)
    async def service_info():
        return {
            "service": "Local Search Service",
            "version": __version__,
            "health": "/api/health",
            "api_docs": "/docs",
        }

    return app


app = create_app()
