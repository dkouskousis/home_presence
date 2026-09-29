"""Presence entities for all devices and for each group."""

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.helpers import entity_platform
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    coordinator.platforms["binary_sensor"] = entity_platform.async_get_current_platform()
    async_add_entities([AnyoneHome(coordinator),
                        *(PresenceGroup(coordinator, group_id)
                          for group_id in coordinator.groups)])


class AnyoneHome(CoordinatorEntity, BinarySensorEntity):
    _attr_name = "Anyone at home"
    _attr_icon = "mdi:home-account"
    _attr_device_class = BinarySensorDeviceClass.PRESENCE

    def __init__(self, coordinator):
        super().__init__(coordinator)
        self._attr_unique_id = coordinator.unique_id("all", "home")

    @property
    def is_on(self):
        return bool(self.coordinator.present_ids())


class PresenceGroup(CoordinatorEntity, BinarySensorEntity):
    _attr_device_class = BinarySensorDeviceClass.PRESENCE
    _attr_icon = "mdi:account-group"

    def __init__(self, coordinator, group_id):
        super().__init__(coordinator)
        self.group_id = group_id
        self._attr_unique_id = coordinator.unique_id("group", group_id)

    @property
    def name(self):
        return self.coordinator.groups[self.group_id]["name"]

    @property
    def is_on(self):
        return bool(self.coordinator.group_present_ids(self.group_id))

    @property
    def extra_state_attributes(self):
        return {"devices_at_home": [self.coordinator.devices[device_id]["name"]
                                    for device_id in self.coordinator.group_present_ids(
                                        self.group_id
                                    )]}
