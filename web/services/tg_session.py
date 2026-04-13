import os
import aiohttp
from aiohttp_socks import ProxyConnector


async def get_tg_session() -> aiohttp.ClientSession:
    """Return aiohttp session with SOCKS5/HTTP proxy support for Telegram API."""
    proxy = os.getenv("TG_PROXY_URL")
    if proxy:
        connector = ProxyConnector.from_url(proxy)
        return aiohttp.ClientSession(connector=connector)
    return aiohttp.ClientSession()
