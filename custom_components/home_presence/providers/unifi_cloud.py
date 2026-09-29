"""Read-only UniFi Cloud Connector client."""

from __future__ import annotations

import asyncio
from urllib.parse import quote

import aiohttp

from ..const import API_ROOT


class UniFiApiError(Exception):
    """The UniFi API request failed."""


class UniFiCloud:
    """Access Site Manager and the Network application through the cloud."""

    def __init__(self, session: aiohttp.ClientSession, api_key: str) -> None:
        self.session = session
        self.headers = {"X-API-Key": api_key, "Accept": "application/json"}

    async def get(self, path: str, params: dict | None = None) -> dict:
        try:
            async with asyncio.timeout(20):
                async with self.session.get(
                    f"{API_ROOT}{path}", headers=self.headers, params=params
                ) as response:
                    if response.status != 200:
                        raise UniFiApiError(f"UniFi API returned HTTP {response.status}")
                    result = await response.json()
                    if not isinstance(result, dict):
                        raise UniFiApiError("Unexpected UniFi API response")
                    return result
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as err:
            raise UniFiApiError("Could not reach the UniFi Cloud API") from err

    async def hosts(self) -> list[dict]:
        return (await self.get("/hosts")).get("data", [])

    def network_path(self, console_id: str) -> str:
        return (
            f"/connector/consoles/{quote(console_id, safe='')}"
            "/proxy/network/integration/v1"
        )

    async def pages(self, path: str) -> list[dict]:
        items: list[dict] = []
        offset = 0
        while True:
            result = await self.get(path, {"offset": offset, "limit": 200})
            page = result.get("data")
            if not isinstance(page, list):
                raise UniFiApiError("Unexpected UniFi list response")
            items.extend(page)
            offset += len(page)
            if not page or offset >= result.get("totalCount", offset):
                return items

    async def sites(self, console_id: str) -> list[dict]:
        return await self.pages(f"{self.network_path(console_id)}/sites")

    async def clients(self, console_id: str, site_id: str) -> list[dict]:
        return await self.pages(
            f"{self.network_path(console_id)}/sites/{quote(site_id, safe='')}/clients"
        )


def normalize_mac(value: str) -> str:
    digits = "".join(char for char in value.lower() if char in "0123456789abcdef")
    return ":".join(digits[i:i + 2] for i in range(0, 12, 2)) if len(digits) == 12 else ""


class UniFiPresenceProvider:
    """Translate UniFi's connected clients to generic presence devices."""

    def __init__(self, api: UniFiCloud, console_id: str, site_id: str) -> None:
        self.api = api
        self.console_id = console_id
        self.site_id = site_id

    async def connected(self) -> dict[str, dict[str, str]]:
        connected = {}
        for client in await self.api.clients(self.console_id, self.site_id):
            mac = normalize_mac(client.get("macAddress") or "")
            if not mac:
                continue  # A VPN client may not have a MAC address.
            connected[mac] = {
                "mac": mac,
                "name": client.get("name") or client.get("hostname") or mac,
                "ip": client.get("ipAddress") or "",
                "type": client.get("type") or "",
            }
        return connected
