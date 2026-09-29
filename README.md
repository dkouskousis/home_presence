# Home Presence

Home Assistant integration for tracking selected devices on your network, naming them, and organizing them into groups. The first presence source is UniFi Cloud through the official Cloud Connector API. Additional sources can use the provider interface.

## Features

- **Devices:** Select a currently connected client, give it a name, and choose one or more groups. Every selected device gets a `device_tracker` with `home` / `not_home` state. Edit its name and groups later.
- **Groups:** Create groups such as Family, Friends, and Guests. Every group gets a `binary_sensor` that is on if at least one member is home.
- **Overall presence:** `binary_sensor.anyone_at_home` and a count sensor for all selected devices. Actual entity IDs depend on your HA entity registry.
- **Integrations:** See connection status and add a new source through Home Assistant's integration setup.
- **Settings:** Configure polling (30–600 seconds) and away delay (0–3600 seconds) separately per source.

## Requirements

- UniFi console with Cloud Connector support (UniFi OS firmware 5.0.3 or later) and UniFi Network with the official integration API.
- UniFi Site Manager API key with access to the console and site; outbound HTTPS from Home Assistant to `api.ui.com`.

## Install

1. Add this repository to HACS as a custom integration, or copy `custom_components/guest_presence` to `/config/custom_components/`. Restart Home Assistant.
2. In **Settings → Devices & services → Add integration**, choose **Home Presence → UniFi Cloud**. Enter the UniFi Site Manager API key from **Settings → API Keys**, then choose the console and site.
3. Open **Home Presence** in the sidebar. In **Groups**, create any groups you need. In **Devices**, add phones or other devices and assign them to groups.
4. Use the device trackers or group binary sensors in automations. Entity IDs are displayed beside tracked devices and groups.

Selections persist when a device disconnects. A device's IP may change; it is identified by the MAC address reported by UniFi. A phone that rotates its private Wi-Fi address must be added again under its new address. Only connected devices appear for first-time selection. If the cloud connection fails, the entities become unavailable rather than reporting everybody away.

The API key stays in the Home Assistant config entry and is not sent to the panel. The panel is admin-only. Selected names, group memberships, and settings are stored by Home Assistant.
