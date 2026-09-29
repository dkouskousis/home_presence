"""Validate portable backups without a running Home Assistant instance."""

import importlib.util
from pathlib import Path
import unittest

MODULE = Path(__file__).resolve().parents[1] / "custom_components/home_presence/backup.py"
spec = importlib.util.spec_from_file_location("home_presence_backup", MODULE)
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupValidationTest(unittest.TestCase):
    def setUp(self):
        self.data = {
            "format": "home_presence", "version": 2,
            "sources": {"omada": {
                "type": "omada", "address": "https://omada.example:8043",
                "omadac_id": "controller", "client_id": "client",
                "client_secret": "secret", "site_id": "site", "label": "Omada",
            }},
            "devices": {"omada|aa:bb:cc:dd:ee:ff": {
                "name": "Phone", "groups": ["family"],
                "poll_seconds": 60, "away_seconds": 180,
            }},
            "groups": {"family": {"name": "Family"}},
        }

    def test_valid_backup_retains_credentials_and_memberships(self):
        self.assertIs(backup.validate_backup(self.data), self.data)
        self.assertEqual(self.data["sources"]["omada"]["client_secret"], "secret")

    def test_rejects_device_with_missing_group(self):
        self.data["devices"]["omada|aa:bb:cc:dd:ee:ff"]["groups"] = ["missing"]
        with self.assertRaises(ValueError):
            backup.validate_backup(self.data)

    def test_rejects_http_controller_address(self):
        self.data["sources"]["omada"]["address"] = "http://omada.example"
        with self.assertRaises(ValueError):
            backup.validate_backup(self.data)

    def test_rejects_unexpected_keys(self):
        self.data["sources"]["omada"]["extra"] = "unexpected"
        with self.assertRaises(ValueError):
            backup.validate_backup(self.data)

    def test_rejects_device_from_unconfigured_source(self):
        self.data["sources"] = {}
        with self.assertRaises(ValueError):
            backup.validate_backup(self.data)

    def test_allows_seven_second_polling_and_rejects_six(self):
        device = self.data["devices"]["omada|aa:bb:cc:dd:ee:ff"]
        device["poll_seconds"] = 7
        self.assertIs(backup.validate_backup(self.data), self.data)
        device["poll_seconds"] = 6
        with self.assertRaises(ValueError):
            backup.validate_backup(self.data)

    def test_rejects_invalid_per_device_away_delay(self):
        self.data["devices"]["omada|aa:bb:cc:dd:ee:ff"]["away_seconds"] = 3601
        with self.assertRaises(ValueError):
            backup.validate_backup(self.data)

    def test_migrates_version_one_settings_to_every_device(self):
        self.data["version"] = 1
        self.data["settings"] = {"poll_seconds": 7, "away_seconds": 120}
        device = self.data["devices"]["omada|aa:bb:cc:dd:ee:ff"]
        device.pop("poll_seconds")
        device.pop("away_seconds")
        result = backup.validate_backup(self.data)
        self.assertEqual(result["version"], 2)
        self.assertNotIn("settings", result)
        self.assertEqual(result["devices"]["omada|aa:bb:cc:dd:ee:ff"]["poll_seconds"], 7)
        self.assertEqual(result["devices"]["omada|aa:bb:cc:dd:ee:ff"]["away_seconds"], 120)


if __name__ == "__main__":
    unittest.main()
