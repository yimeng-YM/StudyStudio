from __future__ import annotations

import socket
from unittest.mock import patch

import pytest

from app.security import UrlPolicyError, validate_public_url


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    (
        "http://127.0.0.1/",
        "http://localhost/",
        "http://192.168.1.1/",
        "http://169.254.169.254/latest/meta-data/",
        "file:///etc/passwd",
        "https://example.com:8443/private",
        "https://user:password@example.com/",
    ),
)
async def test_rejects_unsafe_urls(url):
    with pytest.raises(UrlPolicyError):
        await validate_public_url(url)


@pytest.mark.asyncio
async def test_accepts_public_https_url():
    public_result = [
        (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("93.184.216.34", 443)),
    ]
    with patch("app.security.socket.getaddrinfo", return_value=public_result):
        assert await validate_public_url("https://example.com/page") == "https://example.com/page"


@pytest.mark.asyncio
async def test_rejects_hostname_resolving_to_private_ip():
    private_result = [
        (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("10.0.0.10", 443)),
    ]
    with patch("app.security.socket.getaddrinfo", return_value=private_result):
        with pytest.raises(UrlPolicyError):
            await validate_public_url("https://attacker.example/")
