from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from .cache import CacheStore
from .config import get_settings
from .extractor import ExtractionError, ExtractionService
from .models import ExtractRequest, SearchRequest
from .search import SearchService, SearchServiceError
from .security import UrlPolicyError


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    cache = CacheStore(settings.cache_path)
    cache.purge_expired()
    app.state.cache = cache
    app.state.search = SearchService(settings, cache)
    app.state.extractor = ExtractionService(settings, cache)
    try:
        yield
    finally:
        await app.state.search.close()
        await app.state.extractor.close()
        cache.close()


app = FastAPI(
    title="StudyStudio Local Search Service",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["127.0.0.1", "localhost", "[::1]", "testserver"],
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    allow_private_network=True,
)


@app.middleware("http")
async def protect_local_api(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.url.path.startswith("/api/") and origin and origin not in settings.allowed_origins:
        return JSONResponse(status_code=403, content={"error": "不允许该网页调用本地 StudyStudio 服务"})
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
        "browser_fallback": settings.enable_browser_fallback,
    }


@app.post("/api/web/search")
async def web_search(payload: SearchRequest, request: Request):
    try:
        return await request.app.state.search.search(payload.query, payload.max_results)
    except SearchServiceError as exc:
        return JSONResponse(status_code=502, content={"error": str(exc), "query": payload.query})


@app.post("/api/web/images")
async def image_search(payload: SearchRequest, request: Request):
    try:
        return await request.app.state.search.search(payload.query, payload.max_results, images=True)
    except SearchServiceError as exc:
        return JSONResponse(status_code=502, content={"error": str(exc), "query": payload.query})


@app.post("/api/web/extract")
async def extract_url(payload: ExtractRequest, request: Request):
    try:
        return await request.app.state.extractor.extract(payload.url, payload.max_chars)
    except UrlPolicyError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc), "url": payload.url})
    except ExtractionError as exc:
        return JSONResponse(status_code=502, content={"error": str(exc), "url": payload.url})


@app.get("/", include_in_schema=False)
async def service_info():
    return {
        "service": "StudyStudio Local Search Service",
        "frontend": "Run start.bat and open http://localhost:5173",
        "health": "/api/health",
        "api_docs": "/docs",
    }
