"""
Collection classes for managing multiple tools.
From https://github.com/anthropics/anthropic-quickstarts/blob/main/computer-use-demo/computer_use_demo/tools/collection.py
"""

from typing import Any

from anthropic.types.beta import BetaToolUnionParam

from .base import (
    BaseAnthropicTool,
    ToolError,
    ToolFailure,
    ToolResult,
)


class ToolCollection:
    """A collection of anthropic-defined tools."""

    def __init__(self, *tools: BaseAnthropicTool):
        self.tools = tools
        self.tool_map = {tool.to_params()["name"]: tool for tool in tools}

    def to_params(
        self,
    ) -> list[BetaToolUnionParam]:
        return [tool.to_params() for tool in self.tools]

    async def run(self, *, name: str, tool_input: dict[str, Any]) -> ToolResult:
        tool = self.tool_map.get(name)
        if not tool:
            return ToolFailure(error=f"Tool {name} not found")

        try:
            # Handle different tool types based on their expected input structure
            if name == "playwright":
                # Validate playwright tool input
                method = tool_input.get("method")
                args = tool_input.get("args")
                if not method or not isinstance(args, list):
                    return ToolFailure(
                        error="Invalid input for playwright tool: method and args are required"
                    )
                return await tool(**tool_input)
            else:
                # Validate computer tool input
                action = tool_input.get("action")
                if not action:
                    return ToolFailure(error=f"Invalid action {action} for tool {name}")
                return await tool(**tool_input)
        except ToolError as e:
            return ToolFailure(error=e.message)
        except Exception as e:
            return ToolFailure(error=f"Unexpected error in {name}: {str(e)}")