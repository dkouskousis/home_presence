"""Home Presence: selected devices, groups, and source integrations."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from pathlib import Path
from uuid import uuid4

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import DOMAIN
from .providers.base import PresenceProvider
from .providers.unifi_cloud import UniFiApiError, UniFiCloud, UniFiPresenceProvider, normalize_mac

PLATFORMS = ["device_tracker", "binary_sensor", "sensor"]
DEFAULT_SETTINGS = {"poll_seconds": 60, "away_seconds": 180}
_LOGGER = logging.getLogger(__name__)


class PresenceCoordinator(DataUpdateCoordinator):
    """Keep explicitly selected devices and groups across source updates."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(hass, logger=_LOGGER, name=DOMAIN,
                         update_interval=timedelta(seconds=60))
        self.entry = entry
        self.provider: PresenceProvider = UniFiPresenceProvider(
            UniFiCloud(async_get_clientsession(hass), entry.data["api_key"]),
            entry.data["console_id"], entry.data["site_id"],
        )
        self.store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}")
        self.devices: dict[str, dict] = {}
        self.groups: dict[str, dict] = {}
        self.settings = DEFAULT_SETTINGS.copy()
        self.last_seen: dict[str, datetime] = {}
        self.platforms: dict[str, object] = {}

    async def load(self) -> None:
        saved = await self.store.async_load() or {}
        if "guests" in saved and "devices" not in saved:
            self.groups = {"guests": {"name": "Guests"}}
            self.devices = {mac: {"name": name, "groups": ["guests"]}
                            for mac, name in saved["guests"].items()}
            await self.save()
        else:
            self.devices = saved.get("devices", {})
            self.groups = saved.get("groups", {})
        self.settings.update(saved.get("settings", {}))
        self.update_interval = timedelta(seconds=self.settings["poll_seconds"])

    async def save(self) -> None:
        await self.store.async_save({
            "devices": self.devices, "groups": self.groups, "settings": self.settings,
        })

    async def _async_update_data(self) -> dict[str, dict]:
        try:
            connected = await self.provider.connected()
        except UniFiApiError as err:
            raise UpdateFailed(str(err)) from err
        now = datetime.now(timezone.utc)
        for device_id in connected:
            if device_id in self.devices:
                self.last_seen[device_id] = now
        return connected

    def present(self, device_id: str) -> bool:
        if device_id in (self.data or {}):
            return True
        seen = self.last_seen.get(device_id)
        return bool(seen and (datetime.now(timezone.utc) - seen).total_seconds()
                    < self.settings["away_seconds"])

    def present_ids(self) -> list[str]:
        return [device_id for device_id in self.devices if self.present(device_id)]

    def group_present_ids(self, group_id: str) -> list[str]:
        return [device_id for device_id in self.present_ids()
                if group_id in self.devices[device_id]["groups"]]

    def unique_id(self, kind: str, key: str) -> str:
        return f"{self.entry.entry_id}_{kind}_{key}"

    async def rename_entity(self, domain: str, kind: str, key: str, name: str) -> None:
        registry = entity_registry.async_get(self.hass)
        entity_id = registry.async_get_entity_id(domain, DOMAIN, self.unique_id(kind, key))
        if entity_id:
            registry.async_update_entity(entity_id, name=name)

    async def remove_entity(self, domain: str, kind: str, key: str) -> None:
        registry = entity_registry.async_get(self.hass)
        entity_id = registry.async_get_entity_id(domain, DOMAIN, self.unique_id(kind, key))
        if entity_id:
            await self.platforms[domain].async_remove_entity(entity_id)
            registry.async_remove(entity_id)

    async def set_device(self, device_id: str, name: str | None,
                         groups: list[str] | None = None) -> None:
        existed = device_id in self.devices
        if name is None:
            self.devices.pop(device_id, None)
            self.last_seen.pop(device_id, None)
            await self.save()
            if existed:
                await self.remove_entity("device_tracker", "device", device_id)
        else:
            self.devices[device_id] = {"name": name.strip(), "groups": groups or []}
            if device_id in (self.data or {}):
                self.last_seen[device_id] = datetime.now(timezone.utc)
            await self.save()
            if existed:
                await self.rename_entity("device_tracker", "device", device_id, name.strip())
            else:
                from .device_tracker import PresenceDevice
                await self.platforms["device_tracker"].async_add_entities(
                    [PresenceDevice(self, device_id)]
                )
        self.async_update_listeners()

    async def set_group(self, group_id: str, name: str | None) -> str:
        existed = group_id in self.groups
        if name is None:
            self.groups.pop(group_id, None)
            for device in self.devices.values():
                device["groups"] = [g for g in device["groups"] if g != group_id]
            await self.save()
            if existed:
                await self.remove_entity("binary_sensor", "group", group_id)
        else:
            group_id = group_id or uuid4().hex
            self.groups[group_id] = {"name": name.strip()}
            await self.save()
            if existed:
                await self.rename_entity("binary_sensor", "group", group_id, name.strip())
            else:
                from .binary_sensor import PresenceGroup
                await self.platforms["binary_sensor"].async_add_entities(
                    [PresenceGroup(self, group_id)]
                )
        self.async_update_listeners()
        return group_id

    async def set_settings(self, poll_seconds: int, away_seconds: int) -> None:
        self.settings = {"poll_seconds": poll_seconds, "away_seconds": away_seconds}
        self.update_interval = timedelta(seconds=poll_seconds)
        await self.save()
        self.async_update_listeners()


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = PresenceCoordinator(hass, entry)
    await coordinator.load()
    await coordinator.async_config_entry_first_refresh()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    if not hass.data[DOMAIN].get("_static_registered"):
        await hass.http.async_register_static_paths([
            StaticPathConfig(f"/{DOMAIN}/panel.js", str(Path(__file__).parent / "panel.js"), False)
        ])
        hass.data[DOMAIN]["_static_registered"] = True
    if not hass.data[DOMAIN].get("_commands_registered"):
        for command in (ws_list, ws_set_device, ws_set_group, ws_set_settings):
            websocket_api.async_register_command(hass, command)
        hass.data[DOMAIN]["_commands_registered"] = True
    if not hass.data[DOMAIN].get("_panel_registered"):
        await panel_custom.async_register_panel(
            hass, frontend_url_path=DOMAIN, webcomponent_name="home-presence-panel",
            module_url=f"/{DOMAIN}/panel.js?v=2", sidebar_title="Home Presence",
            sidebar_icon="mdi:home-account", require_admin=True,
            config_panel_domain=DOMAIN,
        )
        hass.data[DOMAIN]["_panel_registered"] = True
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    hass.data[DOMAIN].pop(entry.entry_id)
    if not any(isinstance(item, PresenceCoordinator) for item in hass.data[DOMAIN].values()):
        frontend.async_remove_panel(hass, DOMAIN)
        hass.data[DOMAIN]["_panel_registered"] = False
    return True


def get_coordinator(hass: HomeAssistant, connection: websocket_api.ActiveConnection,
                    msg: dict) -> PresenceCoordinator | None:
    coordinator = hass.data.get(DOMAIN, {}).get(msg["entry_id"])
    if not isinstance(coordinator, PresenceCoordinator):
        connection.send_error(msg["id"], "invalid_site", "Unknown presence source")
        return None
    return coordinator


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/list"})
@websocket_api.require_admin
@callback
def ws_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entries = []
    registry = entity_registry.async_get(hass)
    for entry_id, coordinator in hass.data.get(DOMAIN, {}).items():
        if not isinstance(coordinator, PresenceCoordinator):
            continue
        def entity_id(domain: str, kind: str, key: str) -> str | None:
            return registry.async_get_entity_id(domain, DOMAIN, coordinator.unique_id(kind, key))

        entries.append({
            "id": entry_id, "title": coordinator.entry.title,
            "provider": "UniFi Cloud", "available": coordinator.last_update_success,
            "clients": list((coordinator.data or {}).values()),
            "devices": coordinator.devices, "groups": coordinator.groups,
            "device_entities": {key: entity_id("device_tracker", "device", key)
                                for key in coordinator.devices},
            "group_entities": {key: entity_id("binary_sensor", "group", key)
                               for key in coordinator.groups},
            "settings": coordinator.settings,
            "present": coordinator.present_ids() if coordinator.last_update_success else [],
        })
    connection.send_result(msg["id"], entries)


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/set_device",
    vol.Required("entry_id"): str,
    vol.Required("device_id"): str,
    vol.Optional("name"): vol.Any(vol.All(str, vol.Length(min=1, max=80)), None),
    vol.Optional("groups"): [str],
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_device(hass: HomeAssistant, connection: websocket_api.ActiveConnection,
                        msg: dict) -> None:
    if (coordinator := get_coordinator(hass, connection, msg)) is None:
        return
    device_id = normalize_mac(msg["device_id"])
    if not device_id or (device_id not in (coordinator.data or {})
                         and device_id not in coordinator.devices):
        connection.send_error(msg["id"], "unknown_device", "Device is not connected")
        return
    groups = msg.get("groups", [])
    if any(group_id not in coordinator.groups for group_id in groups):
        connection.send_error(msg["id"], "unknown_group", "Unknown group")
        return
    name = msg.get("name")
    if name is not None and not name.strip():
        connection.send_error(msg["id"], "invalid_name", "Device name is required")
        return
    await coordinator.set_device(device_id, name, list(dict.fromkeys(groups)))
    connection.send_result(msg["id"])


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/set_group",
    vol.Required("entry_id"): str,
    vol.Optional("group_id", default=""): str,
    vol.Optional("name"): vol.Any(vol.All(str, vol.Length(min=1, max=80)), None),
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_group(hass: HomeAssistant, connection: websocket_api.ActiveConnection,
                       msg: dict) -> None:
    if (coordinator := get_coordinator(hass, connection, msg)) is None:
        return
    group_id = msg["group_id"]
    if group_id and group_id not in coordinator.groups:
        connection.send_error(msg["id"], "unknown_group", "Unknown group")
        return
    if not group_id and msg.get("name") is None:
        connection.send_error(msg["id"], "invalid_group", "Group name is required")
        return
    name = msg.get("name")
    if name is not None and not name.strip():
        connection.send_error(msg["id"], "invalid_name", "Group name is required")
        return
    group_id = await coordinator.set_group(group_id, name)
    connection.send_result(msg["id"], {"group_id": group_id})


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/set_settings",
    vol.Required("entry_id"): str,
    vol.Required("poll_seconds"): vol.All(vol.Coerce(int), vol.Range(min=30, max=600)),
    vol.Required("away_seconds"): vol.All(vol.Coerce(int), vol.Range(min=0, max=3600)),
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_settings(hass: HomeAssistant, connection: websocket_api.ActiveConnection,
                          msg: dict) -> None:
    if (coordinator := get_coordinator(hass, connection, msg)) is None:
        return
    await coordinator.set_settings(msg["poll_seconds"], msg["away_seconds"])
    connection.send_result(msg["id"])
