"""Playwright tool for navigation and page interaction."""
from playwright.async_api import Page
from .base import BaseAnthropicTool, ToolError, ToolResult
from typing import Literal
from urllib.parse import urlparse
from anthropic.types.beta import BetaToolUnionParam


SUPPORTED_METHODS = ["goto"]

class PlaywrightTool(BaseAnthropicTool):
    """Tool for navigating and interacting with a Playwright page."""

    name: Literal["playwright"] = "playwright"

    def __init__(self, page: Page):
        self.page = page

 
    def to_params(self) -> BetaToolUnionParam:
        return {
            "name": self.name,
            "description": "Execute Playwright page methods like navigation",
            "input_schema": {
                "type": "object",
                "properties": {
                    "method": {
                        "type": "string",
                        "description": "The playwright function to call.",
                        "enum": SUPPORTED_METHODS,
                    },
                    "args": {
                        "type": "array",
                        "description": "The required arguments",
                        "items": {
                            "type": "string",
                            "description": "The argument to pass to the function",
                        },
                    },
                },
                "required": ["method", "args"],
            },
        }
    
    async def __call__(self, method:str, args:list[str], **kwargs) -> ToolResult:
        """Execute a Playwright method with the given arguments."""
        if method not in SUPPORTED_METHODS:
            raise ToolError(f"Unsupported method: {method}. Supported methods: {', '.join(SUPPORTED_METHODS)}")
      
        match method:
            case "goto":
                return await self._execute_goto(args)
            case _:
                raise ToolError(f"Unsupported method: {method}")

    async def _execute_goto(self, args: list[str]) -> ToolResult:
        """Execute goto method to navigate to URL."""
        if len(args) != 1:
            raise ToolError("goto method requires exactly one argument: the URL")
      
        url =  args[0]
        normalized_url = url
        try:
            parsed = urlparse(url)
            if not parsed.scheme:
                normalized_url = f"https://{url}"
        except Exception:
            raise ToolError(f"Invalid URL format: {url}")
        
        try:
            await self.page.goto(
                normalized_url,
                wait_until="networkidle",
                timeout=30000
            )

             # Wait a bit for the page to fully load
            await self.page.wait_for_timeout(1000)
            current_url = self.page.url
            title = await self.page.title()
            
            return ToolResult(
                output=f'Successfully navigated to {current_url}. Page title: "{title}"'
            )
        except Exception as error:
            raise ToolError(f"Failed to navigate to {normalized_url}: {error}")
        


      

