import os
from typing import Any, Dict, Optional, TypedDict

from playwright.async_api import async_playwright

from loop import sampling_loop


class QueryInput(TypedDict):
    query: str


class QueryOutput(TypedDict):
    result: str


api_key = os.getenv("ANTHROPIC_API_KEY")
if not api_key:
    raise ValueError("ANTHROPIC_API_KEY is not set")


async def cu_task(
    context: Optional[Any] = None,
    payload: Optional[QueryInput] = None,
) -> QueryOutput:
    """Run the computer-use sampling loop with the provided *payload*."""
    if not payload or not payload.get("query"):
        raise ValueError("Query is required")

    browser = None
    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=False)
            context_obj = await browser.new_context()
            page = await context_obj.new_page()

            # Run the sampling loop
            final_messages = await sampling_loop(
                model="claude-sonnet-4-20250514",
                messages=[{
                    "role": "user",
                    "content": payload["query"],
                }],
                api_key=api_key,
                thinking_budget=1024,
                playwright_page=page,
            )

            # Extract the final result
            if not final_messages:
                raise ValueError("No messages were generated during the sampling loop")

            last_message = final_messages[-1]
            if not last_message:
                raise ValueError("Failed to get the last message from the sampling loop")

            result = ""
            if isinstance(last_message.get("content"), str):
                result = last_message["content"]  # type: ignore[assignment]
            else:
                result = "".join(
                    block["text"] for block in last_message["content"]  # type: ignore[index]
                    if isinstance(block, Dict) and block.get("type") == "text"
                )

            return {"result": result}
    except Exception as exc:
        print(f"Error in sampling loop: {exc}")
        raise
    finally:
        if browser is not None:
            await browser.close()