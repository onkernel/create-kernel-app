from __future__ import annotations

import asyncio
from dataclasses import dataclass
from inspect import iscoroutine
from typing import Dict, List, Mapping, Sequence, Type, Union, Any, Literal

# Relative imports from the current package
# Attempt to import concrete tool classes. Provide no-op fallbacks if they
# have not been implemented yet so that *this* module can still be imported
# (useful when converting files incrementally).
try:
    from .computer import ComputerTool20241022, ComputerTool20250124  # type: ignore
except (ImportError, AttributeError):  # pragma: no cover – defensive stub
    class _StubTool:  # noqa: D101 – simple stub for missing dependency
        name = "__stub_tool__"

        @staticmethod
        def toParams():  # type: ignore
            raise NotImplementedError("Tool stub – real implementation missing")

        @staticmethod
        def call(*_args, **_kwargs):  # type: ignore
            raise NotImplementedError("Tool stub – real implementation missing")

    ComputerTool20241022 = _StubTool  # type: ignore
    ComputerTool20250124 = _StubTool  # type: ignore

from .types.computer import Action, ActionParams, ToolResult

# ----------------------------------------------------------------------------
# Public constants & types
# ----------------------------------------------------------------------------

# Allowed tool versions – kept identical to the TypeScript literals
ToolVersion = Literal[
    "computer_use_20250124",
    "computer_use_20241022",
    "computer_use_20250429",
]

# Default tool version – matches the TS default
DEFAULT_TOOL_VERSION: str = "computer_use_20250429"


@dataclass(frozen=True)
class ToolGroup:
    """Immutable grouping of tools that belong to a specific version."""

    version: str  # Using literal strings keeps the type-checker happy without extra libs
    tools: Sequence[Type[Union[ComputerTool20241022, ComputerTool20250124]]]
    beta_flag: str


# ----------------------------------------------------------------------------
# Tool group definitions – ported 1-to-1 from the original file
# ----------------------------------------------------------------------------

TOOL_GROUPS: List[ToolGroup] = [
    ToolGroup(
        version="computer_use_20241022",
        tools=[ComputerTool20241022],
        beta_flag="computer-use-2024-10-22",
    ),
    ToolGroup(
        version="computer_use_20250124",
        tools=[ComputerTool20250124],
        beta_flag="computer-use-2025-01-24",
    ),
    # 20250429 version inherits from 20250124
    ToolGroup(
        version="computer_use_20250429",
        tools=[ComputerTool20250124],
        beta_flag="computer-use-2025-01-24",
    ),
]

# Dict lookup by version string
TOOL_GROUPS_BY_VERSION: Dict[str, ToolGroup] = {
    group.version: group for group in TOOL_GROUPS
}


# ----------------------------------------------------------------------------
# Collection wrapper for runtime tool execution
# ----------------------------------------------------------------------------

class ToolCollection:
    """Runtime registry that provides convenient access to tool instances."""

    def __init__(self, *tools: Union[ComputerTool20241022, ComputerTool20250124]):
        # Map tool name → tool instance for fast lookup
        self._tools: Dict[str, Union[ComputerTool20241022, ComputerTool20250124]] = {
            tool.name: tool for tool in tools
        }

    # Keeping the original camelCase for parity with the TS source
    def toParams(self) -> List[ActionParams]:  # noqa: N802
        """Return the parameter schemas for every registered tool."""
        return [tool.toParams() for tool in self._tools.values()]

    async def run(
        self,  # noqa: D401 (method docs not enforced)
        name: str,
        tool_input: Mapping[str, Any],
    ) -> ToolResult:
        """Execute a named tool with the provided *tool_input* mapping.

        The *tool_input* **must** contain an ``action`` key whose value is a
        member of the :class:`Action` enum; otherwise a ``ValueError`` is
        raised – mirroring the original TS behaviour.
        """
        tool = self._tools.get(name)
        if tool is None:
            raise ValueError(f"Tool {name} not found")

        action_value = tool_input.get("action")
        if action_value not in Action:
            raise ValueError(f"Invalid action {action_value} for tool {name}")

        # Execute the tool – handle both sync and async callables gracefully
        result = tool.call(tool_input)  # type: ignore[attr-defined]
        if iscoroutine(result):
            return await result  # type: ignore[misc]
        return result  # type: ignore[return-value]
