from __future__ import annotations

import asyncio
import base64
from typing import Any, Dict, Mapping, Optional, Set, Tuple, Union

from playwright.async_api import Page

from .types.computer import (
    Action,
    ActionParams,
    ToolError,
    ToolResult,
)
from .utils.keyboard import KeyboardUtils
from .utils.validator import ActionValidator

# ----------------------------------------------------------------------------
# Public classes
# ----------------------------------------------------------------------------

TYPING_DELAY_MS: int = 12  # Delay between keystrokes when typing


class ComputerTool:  # pylint: disable=too-many-public-methods
    """Python adaptation of the TypeScript *ComputerTool* implementation.

    The class intentionally mirrors the API of the original so that the rest of
    the code-base (e.g. *tools.collection.ToolCollection*) can stay unchanged.
    """

    # Class-level identifier expected by *ToolCollection*
    name: str = "computer"

    # Supported versions
    _SUPPORTED_VERSIONS: Set[str] = {"20241022", "20250124"}

    # Screen-capture delay (seconds) – tuned for visual stability
    _SCREENSHOT_DELAY_S: float = 2.0

    # ---------------------------------------------------------------------
    # Construction helpers
    # ---------------------------------------------------------------------

    def __init__(self, page: Page, version: str = "20250124") -> None:
        if version not in self._SUPPORTED_VERSIONS:
            raise ValueError(f"Unsupported computer-tool version: {version}")

        self.page: Page = page
        self.version: str = version

        # Keep the action groupings identical to the TS source
        self._mouse_actions: Set[Action] = {
            Action.LEFT_CLICK,
            Action.RIGHT_CLICK,
            Action.MIDDLE_CLICK,
            Action.DOUBLE_CLICK,
            Action.TRIPLE_CLICK,
            Action.MOUSE_MOVE,
            Action.LEFT_CLICK_DRAG,
            Action.LEFT_MOUSE_DOWN,
            Action.LEFT_MOUSE_UP,
        }

        self._keyboard_actions: Set[Action] = {
            Action.KEY,
            Action.TYPE,
            Action.HOLD_KEY,
        }

        self._system_actions: Set[Action] = {
            Action.SCREENSHOT,
            Action.CURSOR_POSITION,
            Action.SCROLL,
            Action.WAIT,
        }

    # ------------------------------------------------------------------
    # Metadata helpers – kept camelCase for parity with original code
    # ------------------------------------------------------------------

    @property
    def apiType(self) -> str:  # noqa: N802 – match original naming
        """Return the Anthropic tool *type* string for the selected version."""
        return "computer_20241022" if self.version == "20241022" else "computer_20250124"

    # The *ToolCollection* expects a simple mapping here – not an *ActionParams*
    def toParams(self) -> Dict[str, Any]:  # noqa: N802 – match TS method name
        return {
            "name": self.name,
            "type": self.apiType,
            "display_width_px": 1280,
            "display_height_px": 720,
            "display_number": None,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _mouse_button_for_action(action: Action) -> str:
        if action in {
            Action.LEFT_CLICK,
            Action.DOUBLE_CLICK,
            Action.TRIPLE_CLICK,
            Action.LEFT_CLICK_DRAG,
            Action.LEFT_MOUSE_DOWN,
            Action.LEFT_MOUSE_UP,
        }:
            return "left"
        if action is Action.RIGHT_CLICK:
            return "right"
        if action is Action.MIDDLE_CLICK:
            return "middle"
        raise ToolError(f"Invalid mouse action: {action}")

    async def _handle_mouse_action(self, action: Action, coordinate: Tuple[int, int]) -> ToolResult:
        x, y = ActionValidator.validate_and_get_coordinates(coordinate)

        await self.page.mouse.move(x, y)
        await self.page.wait_for_timeout(100)

        # Pure movement does not require any button interaction
        if action is Action.MOUSE_MOVE:
            await self.page.wait_for_timeout(500)
            return await self._screenshot()

        if action is Action.LEFT_MOUSE_DOWN:
            await self.page.mouse.down()
        elif action is Action.LEFT_MOUSE_UP:
            await self.page.mouse.up()
        else:
            button: str = self._mouse_button_for_action(action)
            if action is Action.DOUBLE_CLICK:
                await self.page.mouse.dblclick(x, y, button=button)  # type: ignore[arg-type]
            elif action is Action.TRIPLE_CLICK:
                await self.page.mouse.click(x, y, button=button, click_count=3)  # type: ignore[arg-type]
            else:
                await self.page.mouse.click(x, y, button=button)  # type: ignore[arg-type]

        await self.page.wait_for_timeout(500)
        return await self._screenshot()

    async def _handle_keyboard_action(
        self,
        action: Action,
        text: str,
        duration: Optional[float] = None,
    ) -> ToolResult:
        if action is Action.HOLD_KEY:
            key = KeyboardUtils.get_playwright_key(text)
            await self.page.keyboard.down(key)
            await asyncio.sleep(duration or 0)
            await self.page.keyboard.up(key)
        elif action is Action.KEY:
            keys = KeyboardUtils.parse_key_combination(text)
            # Press all keys down first …
            for key in keys:
                await self.page.keyboard.down(key)
            # … then release them in reverse order (mirrors physical keyboard behaviour)
            for key in reversed(keys):
                await self.page.keyboard.up(key)
        else:  # Action.TYPE
            await self.page.keyboard.type(text, delay=TYPING_DELAY_MS)

        await self.page.wait_for_timeout(500)
        return await self._screenshot()

    async def _screenshot(self) -> ToolResult:
        """Capture a screenshot and return it encoded as base64 string."""
        try:
            await asyncio.sleep(self._SCREENSHOT_DELAY_S)
            image_bytes: bytes = await self.page.screenshot(type="png")
            base64_image: str = base64.b64encode(image_bytes).decode()
            return ToolResult(base64Image=base64_image)
        except Exception as exc:  # pragma: no cover – defensive
            raise ToolError(f"Failed to take screenshot: {exc}") from exc

    # ------------------------------------------------------------------
    # Public entry-point
    # ------------------------------------------------------------------

    async def call(self, params: Mapping[str, Any]) -> ToolResult:  # noqa: D401
        """Execute an *Action* based on *params* and return the *ToolResult*."""
        # Extract commonly used fields – default to *None* if missing
        action: Action = params.get("action")  # type: ignore[assignment]
        # Allow callers to pass a raw string instead of the *Action* enum
        if isinstance(action, str):
            action = Action(action)

        text: Optional[str] = params.get("text")
        coordinate: Optional[Tuple[int, int]] = params.get("coordinate")
        scroll_direction_param: Optional[str] = (
            params.get("scrollDirection") or params.get("scroll_direction")
        )
        scroll_amount_param: Optional[int] = (
            params.get("scrollAmount") or params.get("scroll_amount")
        )
        duration: Optional[float] = params.get("duration")

        # First – validate parameter sanity
        # Convert *params* to *ActionParams* for validation convenience
        try:
            action_params = ActionParams(**params)  # type: ignore[arg-type]
        except TypeError:
            # Fallback when *params* contains keys that ActionParams does not accept
            action_params = ActionParams(action=action, **{k: v for k, v in params.items() if k != "action"})
        ActionValidator.validate_action_params(action_params, self._mouse_actions, self._keyboard_actions)

        # ------------------------------------------------------------------
        # System-level actions first – no validation required beyond above.
        # ------------------------------------------------------------------
        if action is Action.SCREENSHOT:
            return await self._screenshot()

        if action is Action.CURSOR_POSITION:
            position: Optional[Dict[str, float]] = await self.page.evaluate(
                "() => {\n                    const sel = window.getSelection();\n                    if (!sel || sel.rangeCount === 0) return null;\n                    const rect = sel.getRangeAt(0).getBoundingClientRect();\n                    return rect ? { x: rect.x, y: rect.y } : null;\n                }"
            )
            if position is None:
                raise ToolError("Failed to get cursor position")
            return ToolResult(output=f"X={position['x']},Y={position['y']}")

        if action is Action.SCROLL:
            if self.version != "20250124":
                raise ToolError(f"{action.value} is only available in version 20250124")

            if scroll_direction_param not in {"up", "down", "left", "right"}:
                raise ToolError(
                    f'Scroll direction "{scroll_direction_param}" must be "up", "down", "left", or "right"'
                )
            if scroll_amount_param is not None and (
                not isinstance(scroll_amount_param, (int, float)) or scroll_amount_param < 0
            ):
                raise ToolError("scrollAmount must be a non-negative number")

            # Optionally move the mouse to a coordinate before scrolling
            if coordinate is not None:
                x, y = ActionValidator.validate_and_get_coordinates(coordinate)
                await self.page.mouse.move(x, y)
                await self.page.wait_for_timeout(100)

            amount: float = float(scroll_amount_param or 100)
            if scroll_direction_param in {"down", "up"}:
                await self.page.mouse.wheel(0, amount if scroll_direction_param == "down" else -amount)
            else:
                await self.page.mouse.wheel(amount if scroll_direction_param == "right" else -amount, 0)

            await self.page.wait_for_timeout(500)
            return await self._screenshot()

        if action is Action.WAIT:
            if self.version != "20250124":
                raise ToolError(f"{action.value} is only available in version 20250124")
            if duration is None:
                raise ToolError("duration is required for wait action")
            await asyncio.sleep(duration)
            return await self._screenshot()

        # ------------------------------------------------------------------
        # Delegate to mouse / keyboard handlers
        # ------------------------------------------------------------------
        if action in self._mouse_actions:
            if coordinate is None:
                raise ToolError(f"coordinate is required for {action.value}")
            return await self._handle_mouse_action(action, coordinate)

        if action in self._keyboard_actions:
            if text is None:
                raise ToolError(f"text is required for {action.value}")
            return await self._handle_keyboard_action(action, text, duration)

        # If we reach this point, the action is unknown
        raise ToolError(f"Invalid action: {action}")


# -----------------------------------------------------------------------------
# Version-specific convenience wrappers – preserve original API surface
# -----------------------------------------------------------------------------


class ComputerTool20241022(ComputerTool):
    """Computer tool for the 2024-10-22 version – feature-parity with TS."""

    def __init__(self, page: Page):
        super().__init__(page, "20241022")


class ComputerTool20250124(ComputerTool):
    """Computer tool for the 2025-01-24 version – includes *scroll* & *wait*."""

    def __init__(self, page: Page):
        super().__init__(page, "20250124")
