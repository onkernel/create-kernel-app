"""
Kernel Browser Session Manager.

Provides an async context manager for managing Kernel browser lifecycle
for use with OpenAGI's Lux model.
"""

from dataclasses import dataclass, field
from typing import Optional

from kernel import Kernel


@dataclass
class KernelBrowserSession:
    """
    Manages Kernel browser lifecycle as an async context manager.

    Creates a browser session on entry and cleans it up on exit.
    Provides session_id and viewport dimensions to screenshot provider
    and action handler.
    """

    invocation_id: Optional[str] = None
    viewport_width: int = 1920
    viewport_height: int = 1080
    stealth: bool = True
    timeout_seconds: int = 300

    # Set after browser creation
    session_id: Optional[str] = field(default=None, init=False)
    live_view_url: Optional[str] = field(default=None, init=False)
    _kernel: Optional[Kernel] = field(default=None, init=False)

    async def __aenter__(self) -> "KernelBrowserSession":
        """Create a Kernel browser session."""
        self._kernel = Kernel()

        # Create browser with specified settings
        browser = self._kernel.browsers.create(
            invocation_id=self.invocation_id,
            stealth=self.stealth,
            timeout_seconds=self.timeout_seconds,
        )

        self.session_id = browser.session_id
        self.live_view_url = browser.browser_live_view_url

        print(f"Kernel browser created: {self.session_id}")
        print(f"Live view URL: {self.live_view_url}")

        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Delete the browser session."""
        if self._kernel and self.session_id:
            print(f"Destroying browser session: {self.session_id}")
            self._kernel.browsers.delete_by_id(self.session_id)
            print("Browser session destroyed.")

        self.session_id = None
        self._kernel = None

    @property
    def kernel(self) -> Kernel:
        """Get the Kernel client instance."""
        if self._kernel is None:
            raise RuntimeError("Session not initialized. Use async with context.")
        return self._kernel
