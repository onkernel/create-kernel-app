import os
from typing import TypedDict
import kernel
from kernel import Kernel
from kernel_session import KernelBrowserSession
from kernel_provider import KernelScreenshotProvider
from kernel_handler import KernelActionHandler
from oagi import AsyncDefaultAgent
import asyncio

"""
Example app that runs an agent using OpenAGI's Lux model for computer use.

The Lux model is a vision-language model specifically designed to control
computers by analyzing screenshots and deciding on actions (click, type,
scroll, etc.) in a screenshot-action loop.

Args:
    ctx: Kernel context containing invocation information
    payload: An object with a `task` property
Returns:
    A result indicating success/failure and optionally the result
Invoke this via CLI:
    kernel login  # or: export KERNEL_API_KEY=<your_api_key>
    kernel deploy main.py -e OAGI_API_KEY=XXXXX --force
    kernel invoke python-openagi openagi-task -p '{"task":"go to https://news.ycombinator.com and list top 5 articles"}'
    kernel logs python-openagi -f # Open in separate tab
"""


class OpenAGIInput(TypedDict):
    task: str


class OpenAGIOutput(TypedDict):
    success: bool
    result: str


api_key = os.getenv("OAGI_API_KEY")
if not api_key:
    raise ValueError("OAGI_API_KEY is not set")

client = Kernel()
app = kernel.App("python-openagi")


@app.action("openagi-task")
async def openagi_task(
    ctx: kernel.KernelContext,
    payload: OpenAGIInput,
) -> OpenAGIOutput:
    """
    Execute a browser task using OpenAGI's Lux computer-use model.

    The Lux model analyzes screenshots to understand the current UI state,
    decides on actions, and executes them until the task is complete.
    """

    if not payload or not payload.get("task"):
        raise ValueError("task is required")

    task_instruction = payload["task"]
    print(f"Starting OpenAGI Lux task: {task_instruction}")

    # Create browser session using Kernel
    async with KernelBrowserSession(
        invocation_id=ctx.invocation_id,
        stealth=True,
    ) as session:
        print(f"Kernel browser live view URL: {session.live_view_url}")

        # Create the screenshot provider and action handler
        provider = KernelScreenshotProvider(session)
        handler = KernelActionHandler(session)

        # Create the OpenAGI agent
        agent = AsyncDefaultAgent(
            api_key=api_key,
            max_steps=20,
        )

        # Execute the task
        print(f"Executing task: {task_instruction}")
        success = await agent.execute(
            instruction=task_instruction,
            action_handler=handler,
            image_provider=provider,
        )

        result_message = "Task completed successfully" if success else "Task did not complete within max steps"
        print(result_message)

        return {
            "success": success,
            "result": result_message,
        }
