# Home Presence

A Home Assistant custom integration for finding selected devices at home through UniFi Cloud or TP-Link Omada. Give each device a name and assign it to one or more shared groups, such as Family, Friends, and Guests.

## What it creates

- A `device_tracker` for every selected device (`home` or `not_home`). The entity name follows changes in the Devices tab.
- A presence `binary_sensor` for each group, on when at least one member is home.
- An overall "Anyone at home" binary sensor and a "Devices at home" count sensor.

Entity IDs are shown next to devices and groups in Home Presence. A disconnected device stays selected. Network/API failures make affected device entities unavailable; a group and the totals are unavailable if any of their selected devices have an unavailable source, so an outage does not incorrectly report everyone away.

## Install and configure

1. Add this repository to HACS as a custom integration, or copy `custom_components/home_presence` to `/config/custom_components/`, then restart Home Assistant.
2. Go to **Settings → Devices & services → Add integration → Home Presence**. Complete the one-step setup.
3. Open **Home Presence → Integrations** in the sidebar. Add UniFi Cloud or TP-Link Omada, supply credentials, discover the controller and site, and save. Both sources can be configured together.
4. Add connected devices from **Devices** and assign them to groups created in **Groups**. Set the refresh interval (30–600 seconds) and away delay (0–3600 seconds) in **Settings**.

### UniFi Cloud

Create an API key in UniFi Site Manager → Settings → API Keys. Your console must support the UniFi Cloud Connector integration API. Home Assistant needs outbound HTTPS access to `api.ui.com`. In the Integrations tab, enter the API key, discover your console and Network site, then save.

### TP-Link Omada

In the Omada Controller's Global View → Settings → Platform Integration → Open API, create an app in **Client Credentials** mode with permission for the intended site. Copy its **Interface Access Address**, **Omada ID**, **Client ID**, and **Client Secret** into the Integrations tab. The address must be an HTTPS controller origin (for example `https://controller.example:8043`) with a certificate trusted by Home Assistant. Discover a site, then save. The integration uses the documented Omada Open API, with token renewal and active-client filtering. An API failure is shown in the Integrations tab.

Credentials are stored in Home Assistant's config entry and never returned to the panel when listing configured sources. The Home Presence panel and its WebSocket commands are admin-only. Removing a source also removes its selected devices and their entities; group membership for those devices is removed. MAC addresses identify devices within each source, so the same phone may be added once per network source. A rotating private Wi-Fi address is seen as a new device.

Existing UniFi setups are read and moved into the Integrations tab on upgrade; selected devices and groups are retained. Their device tracker unique IDs change to include the source. Check any automations that refer to old device tracker entity IDs after upgrading.
