"""Create a Home Presence workspace; sources are managed in its panel."""

from homeassistant import config_entries

from .const import DOMAIN


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 2

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Home Presence", data={"sources": {}})
        return self.async_show_form(step_id="user")
