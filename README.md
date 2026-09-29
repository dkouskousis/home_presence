# Guest Presence

Home Assistant custom integration for selecting guest devices from a presence source. The initial supported source is UniFi Cloud, using the official Cloud Connector API. Other sources can be added through the provider interface without changing the integration name or panel.

## Requirements

- UniFi console with Cloud Connector support (UniFi OS firmware 5.0.3 or later) and UniFi Network with the official integration API.
- UniFi Site Manager API key with access to the console and site. Home Assistant needs outbound HTTPS access to `api.ui.com`.

## Install

1. Install the repository as a HACS custom integration, or copy `custom_components/guest_presence` into `/config/custom_components/` and restart Home Assistant.
2. In **Settings → Devices & services → Add integration**, select **Guest Presence**, then **UniFi Cloud**. Enter the UniFi Site Manager API key from **Settings → API Keys** and pick the console and Network site.
3. Open **Guest Presence** in the Home Assistant sidebar. The **Integrations** tab shows the connection and the **Guests** tab lets you select a connected device with **Add guest**.
4. Use **Guests at home** (`binary_sensor`) in automations and **Guest count** (`sensor`) in dashboards. Check the actual entity IDs in your Home Assistant instance.

The panel retains selected devices when they disconnect. The integration polls once per minute and has a three-minute grace period for transient disconnects. If cloud requests fail, the entities become unavailable instead of reporting that nobody is home. It matches on MAC address, so a phone that rotates its private Wi-Fi address needs to be selected again. It only sees clients while they are connected; the integration cannot list historical devices that have never been selected.

The API key stays in Home Assistant's configuration entry and is never sent to the panel. The panel is admin-only; it saves only selected MAC addresses and user-assigned names in Home Assistant storage.
