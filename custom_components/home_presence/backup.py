"""Portable Home Presence backup validation."""

from __future__ import annotations

import re
from urllib.parse import urlsplit

FORMAT = "home_presence"
VERSION = 1
_MAC = re.compile(r"[0-9a-f]{2}(?::[0-9a-f]{2}){5}\Z")
_ID = re.compile(r"[A-Za-z0-9_-]{1,64}\Z")
_FIELDS = {
    "unifi_cloud": {"type", "api_key", "console_id", "site_id", "label"},
    "omada": {"type", "address", "omadac_id", "client_id", "client_secret", "site_id", "label"},
}


def validate_backup(value: object) -> dict:
    """Return validated data with no unexpected keys or untrusted identifiers."""
    if not isinstance(value, dict) or set(value) != {
        "format", "version", "sources", "devices", "groups", "settings"
    } or value["format"] != FORMAT or type(value["version"]) is not int or value["version"] != VERSION:
        raise ValueError("Not a supported Home Presence backup")

    sources, devices, groups, settings = (
        value[key] for key in ("sources", "devices", "groups", "settings")
    )
    if not isinstance(sources, dict) or set(sources) - set(_FIELDS):
        raise ValueError("Invalid integrations in backup")
    for source_id, source in sources.items():
        required = _FIELDS[source_id]
        if (not isinstance(source, dict) or set(source) != required
                or source["type"] != source_id
                or any(not isinstance(source[key], str) or not source[key].strip()
                       or len(source[key]) > 2048 for key in required)):
            raise ValueError(f"Invalid {source_id} integration")
        if source_id == "omada":
            address = urlsplit(source["address"])
            if (address.scheme != "https" or not address.hostname or address.username
                    or address.password or address.path not in ("", "/")
                    or address.query or address.fragment):
                raise ValueError("Invalid Omada HTTPS address")

    if not isinstance(groups, dict) or len(groups) > 1000:
        raise ValueError("Invalid groups in backup")
    for group_id, group in groups.items():
        if (not isinstance(group_id, str) or not _ID.fullmatch(group_id)
                or not isinstance(group, dict) or set(group) != {"name"}
                or not isinstance(group["name"], str)
                or not 1 <= len(group["name"].strip()) <= 80):
            raise ValueError("Invalid group in backup")

    if not isinstance(devices, dict) or len(devices) > 10000:
        raise ValueError("Invalid devices in backup")
    for device_id, device in devices.items():
        if not isinstance(device_id, str) or "|" not in device_id:
            raise ValueError("Invalid device ID in backup")
        source_id, mac = device_id.split("|", 1)
        if (source_id not in sources or not _MAC.fullmatch(mac)
                or not isinstance(device, dict) or set(device) != {"name", "groups"}
                or not isinstance(device["name"], str)
                or not 1 <= len(device["name"].strip()) <= 80
                or not isinstance(device["groups"], list)
                or len(device["groups"]) > len(groups)
                or any(not isinstance(group_id, str) or group_id not in groups
                       for group_id in device["groups"])
                or len(device["groups"]) != len(set(device["groups"]))):
            raise ValueError(f"Invalid device {device_id} in backup")

    if (not isinstance(settings, dict) or set(settings) != {"poll_seconds", "away_seconds"}
            or type(settings["poll_seconds"]) is not int
            or not 30 <= settings["poll_seconds"] <= 600
            or type(settings["away_seconds"]) is not int
            or not 0 <= settings["away_seconds"] <= 3600):
        raise ValueError("Invalid settings in backup")
    return value
