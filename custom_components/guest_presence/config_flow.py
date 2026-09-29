"""Set up a UniFi console and site from a cloud API key."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .providers.unifi_cloud import UniFiApiError, UniFiCloud
from .const import DOMAIN


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Select a cloud host and one Network site."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        if user_input:
            return await self.async_step_unifi_key()
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required("provider"): vol.In({"unifi_cloud": "UniFi Cloud"})}),
        )

    async def async_step_unifi_key(self, user_input=None):
        errors = {}
        if user_input:
            self.key = user_input["api_key"].strip()
            self.api = UniFiCloud(async_get_clientsession(self.hass), self.key)
            try:
                hosts = await self.api.hosts()
            except UniFiApiError:
                errors["base"] = "cannot_connect"
            else:
                self.hosts = {
                    host["id"]: host.get("reportedState", {}).get("name")
                    or host.get("userData", {}).get("name") or host["id"]
                    for host in hosts if host.get("id") and host.get("type") == "console"
                }
                if not self.hosts:
                    errors["base"] = "no_consoles"
                else:
                    return await self.async_step_console()
        return self.async_show_form(
            step_id="unifi_key",
            data_schema=vol.Schema({vol.Required("api_key"): str}),
            errors=errors,
        )

    async def async_step_console(self, user_input=None):
        errors = {}
        if user_input:
            self.console_id = user_input["console_id"]
            try:
                sites = await self.api.sites(self.console_id)
            except UniFiApiError:
                errors["base"] = "cannot_connect"
            else:
                self.sites = {site["id"]: site.get("name", site["id"])
                              for site in sites if site.get("id")}
                if not self.sites:
                    errors["base"] = "no_sites"
                else:
                    return await self.async_step_site()
        return self.async_show_form(
            step_id="console",
            data_schema=vol.Schema({vol.Required("console_id"): vol.In(self.hosts)}),
            errors=errors,
        )

    async def async_step_site(self, user_input=None):
        if user_input:
            site_id = user_input["site_id"]
            await self.async_set_unique_id(f"unifi_cloud:{self.console_id}:{site_id}")
            self._abort_if_unique_id_configured()
            return self.async_create_entry(
                title=f"{self.hosts[self.console_id]} · {self.sites[site_id]}",
                data={"provider": "unifi_cloud", "api_key": self.key, "console_id": self.console_id,
                      "site_id": site_id},
            )
        return self.async_show_form(
            step_id="site",
            data_schema=vol.Schema({vol.Required("site_id"): vol.In(self.sites)}),
        )
