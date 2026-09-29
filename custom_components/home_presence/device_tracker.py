"""A device_tracker for every selected network device."""

from homeassistant.components.device_tracker import BaseScannerEntity, ScannerEntity, SourceType
from homeassistant.helpers import entity_platform
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    coordinator.platforms["device_tracker"] = entity_platform.async_get_current_platform()
    async_add_entities([
        *(PresenceDevice(coordinator, device_id) for device_id in coordinator.devices),
        *(PresenceGroupTracker(coordinator, group_id) for group_id in coordinator.groups),
    ])


class PresenceDevice(CoordinatorEntity, ScannerEntity):
    """A named device connected to a configured presence source."""

    def __init__(self, coordinator, device_id):
        super().__init__(coordinator)
        self.device_id = device_id
        self._attr_unique_id = coordinator.unique_id("device", device_id)

    @property
    def unique_id(self):
        """Keep this source-specific ID instead of ScannerEntity's MAC ID."""
        return self._attr_unique_id

    @property
    def name(self):
        return self.coordinator.devices[self.device_id]["name"]

    @property
    def entity_registry_enabled_default(self):
        """Selected devices should be active even without a HA device registry entry."""
        return True

    @property
    def is_connected(self):
        return self.coordinator.present(self.device_id)

    @property
    def mac_address(self):
        return self.device_id.split("|", 1)[1]

    @property
    def available(self):
        return self.coordinator.source_available(self.device_id)

    @property
    def ip_address(self):
        return (self.coordinator.data or {}).get(self.device_id, {}).get("ip")

    @property
    def extra_state_attributes(self):
        return {"groups": [self.coordinator.groups[group_id]["name"]
                           for group_id in self.coordinator.devices[self.device_id]["groups"]
                           if group_id in self.coordinator.groups]}


class PresenceGroupTracker(CoordinatorEntity, BaseScannerEntity):
    """Expose aggregate group presence as a tracker for HA Person entities."""

    _attr_source_type = SourceType.ROUTER

    def __init__(self, coordinator, group_id):
        super().__init__(coordinator)
        self.group_id = group_id
        self._attr_unique_id = coordinator.unique_id("group_tracker", group_id)

    @property
    def name(self):
        return f"{self.coordinator.groups[self.group_id]['name']} presence"

    @property
    def available(self):
        return all(self.coordinator.source_available(key)
                   for key, device in self.coordinator.devices.items()
                   if self.group_id in device["groups"])

    @property
    def is_connected(self):
        return bool(self.coordinator.group_present_ids(self.group_id))
