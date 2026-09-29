"""Total number of selected devices at home."""

from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([PresentDeviceCount(hass.data[DOMAIN][entry.entry_id])])


class PresentDeviceCount(CoordinatorEntity, SensorEntity):
    _attr_name = "Devices at home"
    _attr_icon = "mdi:devices"
    _attr_native_unit_of_measurement = "devices"

    def __init__(self, coordinator):
        super().__init__(coordinator)
        self._attr_unique_id = coordinator.unique_id("count", "all")

    @property
    def native_value(self):
        return len(self.coordinator.present_ids())
