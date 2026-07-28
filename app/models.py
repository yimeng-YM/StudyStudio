from __future__ import annotations

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    max_results: int = Field(default=5, ge=1, le=10)


class ExtractRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4096)
    max_chars: int = Field(default=16_000, ge=1_000, le=40_000)
