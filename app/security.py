from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit


SAFE_WEB_PORTS = {80, 443}
BLOCKED_HOST_SUFFIXES = (".localhost", ".local", ".internal", ".home.arpa")


class UrlPolicyError(ValueError):
    pass


def _validate_ip(address: str) -> None:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError as exc:
        raise UrlPolicyError("目标主机解析出了无效 IP 地址") from exc
    if not ip.is_global:
        raise UrlPolicyError("出于安全原因，不能读取本机、局域网、链路本地或保留地址")


async def validate_public_url(url: str) -> str:
    """Allow only public HTTP(S) URLs on ports 80/443."""

    raw = (url or "").strip()
    if not raw:
        raise UrlPolicyError("缺少目标网址")
    parsed = urlsplit(raw)
    if parsed.scheme.lower() not in {"http", "https"}:
        raise UrlPolicyError("仅支持 http:// 或 https:// 网页")
    if parsed.username or parsed.password:
        raise UrlPolicyError("目标网址不能包含用户名或密码")
    hostname = (parsed.hostname or "").rstrip(".").lower()
    if not hostname:
        raise UrlPolicyError("目标网址缺少主机名")
    if hostname == "localhost" or hostname.endswith(BLOCKED_HOST_SUFFIXES):
        raise UrlPolicyError("出于安全原因，不能读取本机或局域网主机")
    try:
        port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
    except ValueError as exc:
        raise UrlPolicyError("目标网址端口无效") from exc
    if port not in SAFE_WEB_PORTS:
        raise UrlPolicyError("仅允许访问标准 Web 端口 80 和 443")

    try:
        literal = ipaddress.ip_address(hostname.strip("[]"))
    except ValueError:
        literal = None
    if literal is not None:
        _validate_ip(str(literal))
        return raw

    loop = asyncio.get_running_loop()
    try:
        addresses = await loop.run_in_executor(
            None,
            lambda: socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM),
        )
    except socket.gaierror as exc:
        raise UrlPolicyError("无法解析目标主机") from exc
    if not addresses:
        raise UrlPolicyError("目标主机没有可用地址")
    for entry in addresses:
        _validate_ip(entry[4][0])
    return raw


async def validate_browser_request(url: str) -> bool:
    parsed = urlsplit(url)
    if parsed.scheme in {"about", "blob", "data"}:
        return True
    try:
        await validate_public_url(url)
        return True
    except UrlPolicyError:
        return False
