"""Number of selected guests currently connected."""

from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([GuestCount(hass.data[DOMAIN][entry.entry_id])])


class GuestCount(CoordinatorEntity, SensorEntity):
    _attr_name = "Guest count"
    _attr_icon = "mdi:account-multiple"
    _attr_native_unit_of_measurement = "guests"

    def __init__(self, coordinator):
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.entry.entry_id}_guest_count"

    @property
    def native_value(self):
        return len(self.coordinator.present_guests())
