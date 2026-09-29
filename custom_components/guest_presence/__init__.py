"""Guest presence with replaceable device sources."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import DOMAIN, GRACE_SECONDS, SCAN_INTERVAL_SECONDS
from .providers.base import PresenceProvider
from .providers.unifi_cloud import UniFiApiError, UniFiCloud, UniFiPresenceProvider, normalize_mac

PLATFORMS = ["binary_sensor", "sensor"]
_LOGGER = logging.getLogger(__name__)


class GuestCoordinator(DataUpdateCoordinator):
    """Poll connected clients and remember explicitly selected guest devices."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(hass, logger=_LOGGER,
                         name=DOMAIN, update_interval=timedelta(seconds=SCAN_INTERVAL_SECONDS))
        self.entry = entry
        self.provider: PresenceProvider = UniFiPresenceProvider(
            UniFiCloud(async_get_clientsession(hass), entry.data["api_key"]),
            entry.data["console_id"], entry.data["site_id"],
        )
        self.store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}")
        self.guests: dict[str, str] = {}
        self.last_seen: dict[str, datetime] = {}

    async def load(self) -> None:
        self.guests = (await self.store.async_load() or {}).get("guests", {})

    async def _async_update_data(self) -> dict[str, dict]:
        try:
            connected = await self.provider.connected()
        except UniFiApiError as err:
            raise UpdateFailed(str(err)) from err
        now = datetime.now(timezone.utc)
        for mac in connected:
            if mac in self.guests:
                self.last_seen[mac] = now
        return connected

    def present_guests(self) -> list[str]:
        """A short grace period avoids a transient client disconnect."""
        now = datetime.now(timezone.utc)
        return [mac for mac in self.guests if mac in (self.data or {}) or
                (mac in self.last_seen and
                 (now - self.last_seen[mac]).total_seconds() < GRACE_SECONDS)]

    async def set_guest(self, mac: str, name: str | None) -> None:
        if name is None:
            self.guests.pop(mac, None)
            self.last_seen.pop(mac, None)
        else:
            self.guests[mac] = name.strip() or mac
            if mac in (self.data or {}):
                self.last_seen[mac] = datetime.now(timezone.utc)
        await self.store.async_save({"guests": self.guests})
        self.async_update_listeners()


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = GuestCoordinator(hass, entry)
    await coordinator.load()
    await coordinator.async_config_entry_first_refresh()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    if not hass.data[DOMAIN].get("_panel_registered"):
        await hass.http.async_register_static_paths([
            StaticPathConfig(f"/{DOMAIN}/panel.js", str(Path(__file__).parent / "panel.js"), False)
        ])
        await panel_custom.async_register_panel(
            hass, frontend_url_path=DOMAIN, webcomponent_name="guest-presence-panel",
            module_url=f"/{DOMAIN}/panel.js?v=1", sidebar_title="Guest Presence",
            sidebar_icon="mdi:account-group", require_admin=True,
            config_panel_domain=DOMAIN,
        )
        websocket_api.async_register_command(hass, ws_list)
        websocket_api.async_register_command(hass, ws_set_guest)
        hass.data[DOMAIN]["_panel_registered"] = True
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    hass.data[DOMAIN].pop(entry.entry_id)
    if not any(isinstance(item, GuestCoordinator) for item in hass.data[DOMAIN].values()):
        frontend.async_remove_panel(hass, DOMAIN)
        hass.data[DOMAIN]["_panel_registered"] = False
    return True


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/list"})
@websocket_api.require_admin
@callback
def ws_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entries = []
    for entry_id, coordinator in hass.data.get(DOMAIN, {}).items():
        if not isinstance(coordinator, GuestCoordinator):
            continue
        entries.append({
            "id": entry_id, "title": coordinator.entry.title,
            "provider": "UniFi Cloud",
            "available": coordinator.last_update_success,
            "clients": list((coordinator.data or {}).values()),
            "guests": coordinator.guests,
            "present": coordinator.present_guests() if coordinator.last_update_success else [],
        })
    connection.send_result(msg["id"], entries)


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/set_guest",
    vol.Required("entry_id"): str,
    vol.Required("mac"): str,
    vol.Optional("name"): vol.Any(str, None),
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_guest(hass: HomeAssistant, connection: websocket_api.ActiveConnection,
                       msg: dict) -> None:
    coordinator = hass.data.get(DOMAIN, {}).get(msg["entry_id"])
    mac = normalize_mac(msg["mac"])
    if not isinstance(coordinator, GuestCoordinator) or not mac:
        connection.send_error(msg["id"], "invalid_device", "Invalid site or MAC address")
        return
    name = msg.get("name")
    if name is not None and mac not in (coordinator.data or {}) and mac not in coordinator.guests:
        connection.send_error(msg["id"], "unknown_device", "Client is not connected")
        return
    await coordinator.set_guest(mac, name)
    connection.send_result(msg["id"])
