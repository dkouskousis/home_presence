"""Common contract for guest presence sources."""

from typing import Protocol


class PresenceProvider(Protocol):
    """A source of currently connected devices keyed by stable identifier."""

    async def connected(self) -> dict[str, dict[str, str]]:
        """Return connected devices with name, address, and source details."""
