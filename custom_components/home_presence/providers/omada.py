"""TP-Link Omada Open API using OAuth client credentials."""

from __future__ import annotations

import asyncio
from urllib.parse import quote, urlsplit

import aiohttp

from .unifi_cloud import normalize_mac


class OmadaApiError(Exception):
    """An Omada API request failed."""


def validate_address(address: str) -> str:
    parsed = urlsplit(address.strip().rstrip("/"))
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.path not in ("", "/") or parsed.query
            or parsed.fragment):
        raise OmadaApiError("Use the HTTPS controller origin, including its port if needed")
    return address.strip().rstrip("/")


class Omada:
    def __init__(self, session: aiohttp.ClientSession, address: str, omadac_id: str,
                 client_id: str, client_secret: str) -> None:
        self.session = session
        self.address = validate_address(address)
        self.omadac_id = omadac_id
        self.client_id = client_id
        self.client_secret = client_secret
        self.token: str | None = None
        self.expires_at = 0.0

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        try:
            async with asyncio.timeout(20):
                async with self.session.request(method, f"{self.address}/openapi{path}",
                                                **kwargs) as response:
                    if response.status != 200:
                        raise OmadaApiError(f"Omada API returned HTTP {response.status}")
                    result = await response.json()
                    if not isinstance(result, dict) or result.get("errorCode") != 0:
                        raise OmadaApiError(
                            f"Omada API error: {result.get('msg', result.get('errorCode'))}"
                            if isinstance(result, dict) else "Invalid Omada API response"
                        )
                    return result.get("result") or {}
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as err:
            raise OmadaApiError("Could not reach the Omada Open API (check HTTPS certificate)") from err

    async def authorize(self) -> str:
        loop = asyncio.get_running_loop()
        if self.token and loop.time() < self.expires_at:
            return self.token
        result = await self._request(
            "POST", "/authorize/token?grant_type=client_credentials",
            json={"omadacId": self.omadac_id, "client_id": self.client_id,
                  "client_secret": self.client_secret},
        )
        token = result.get("accessToken")
        if not token:
            raise OmadaApiError("Omada did not return an access token")
        self.token = token
        self.expires_at = loop.time() + max(0, int(result.get("expiresIn", 3600)) - 60)
        return token

    async def pages(self, path: str, active_only: bool = False) -> list[dict]:
        items: list[dict] = []
        page = 1
        while True:
            token = await self.authorize()
            result = await self._request("GET", f"/v1/{quote(self.omadac_id, safe='')}{path}",
                                         headers={"Authorization": f"AccessToken={token}"},
                                         params={"page": page, "pageSize": 200,
                                                 **({"filters.active": "true"} if active_only else {})})
            data = result.get("data") if isinstance(result, dict) else None
            if not isinstance(data, list):
                raise OmadaApiError("Unexpected Omada list response")
            items.extend(data)
            if not data or len(data) < 200 or len(items) >= result.get("totalRows", float("inf")):
                return items
            page += 1

    async def sites(self) -> list[dict]:
        return await self.pages("/sites")

    async def clients(self, site_id: str) -> list[dict]:
        return await self.pages(f"/sites/{quote(site_id, safe='')}/clients", active_only=True)


class OmadaPresenceProvider:
    def __init__(self, api: Omada, site_id: str) -> None:
        self.api = api
        self.site_id = site_id

    async def connected(self) -> dict[str, dict[str, str]]:
        clients = {}
        for client in await self.api.clients(self.site_id):
            if client.get("active") is False:
                continue
            mac = normalize_mac(client.get("mac") or client.get("macAddress") or "")
            if mac:
                clients[mac] = {"mac": mac, "name": client.get("name") or
                                client.get("hostName") or mac,
                                "ip": client.get("ip") or client.get("ipAddress") or "",
                                "type": client.get("wireless") and "wireless" or "wired"}
        return clients
