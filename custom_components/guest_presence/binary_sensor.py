"""True when at least one selected guest is connected."""

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([GuestsAtHome(hass.data[DOMAIN][entry.entry_id])])


class GuestsAtHome(CoordinatorEntity, BinarySensorEntity):
    _attr_name = "Guests at home"
    _attr_icon = "mdi:account-group"
    _attr_device_class = BinarySensorDeviceClass.PRESENCE

    def __init__(self, coordinator):
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.entry.entry_id}_guests_home"

    @property
    def is_on(self):
        return bool(self.coordinator.present_guests())

    @property
    def extra_state_attributes(self):
        return {"guests": [self.coordinator.guests[mac]
                           for mac in self.coordinator.present_guests()]}
