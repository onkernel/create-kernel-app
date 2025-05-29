import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from anthropic import AsyncAnthropic
from playwright.async_api import Page

from tools.collection import (
    DEFAULT_TOOL_VERSION,
    TOOL_GROUPS_BY_VERSION,
    ToolCollection,
    ToolVersion,
)
from tools.types.computer import Action, ActionParams
from custom_types.beta import BetaMessageParam, BetaTextBlock
from utils.message_processing import (
    PROMPT_CACHING_BETA_FLAG,
    inject_prompt_caching,
    maybe_filter_to_n_most_recent_images,
    response_to_params,
)
from utils.tool_results import make_api_tool_result


# System prompt optimized for the environment
SYSTEM_PROMPT = f"""<SYSTEM_CAPABILITY>
* You are utilising an Ubuntu virtual machine using {os.uname().machine} architecture with internet access.
* When you connect to the display, CHROMIUM IS ALREADY OPEN. The url bar is not visible but it is there.
* If you need to navigate to a new page, use ctrl+l to focus the url bar and then enter the url.
* You won't be able  to see the url bar from the screenshot but ctrl-l still works.
* When viewing a page it can be helpful to zoom out so that you can see everything on the page.
* Either that, or make sure you scroll down to see everything before deciding something isn't available.
* When using your computer function calls, they take a while to run and send back to you.
* Where possible/feasible, try to chain multiple of these calls all into one function calls request.
* The current date is {datetime.now().strftime("%A, %B %d, %Y")}.
* After each step, take a screenshot and carefully evaluate if you have achieved the right outcome.
* Explicitly show your thinking: "I have evaluated step X..." If not correct, try again.
* Only when you confirm a step was executed correctly should you move on to the next one.
</SYSTEM_CAPABILITY>

<IMPORTANT>
* When using Chromium, if a startup wizard appears, IGNORE IT. Do not even click "skip this step".
* Instead, click on the search bar on the center of the screen where it says "Search or enter address", and enter the appropriate search term or URL there.
</IMPORTANT>"""


async def sampling_loop(
    *,
    model: str,
    system_prompt_suffix: Optional[str] = None,
    messages: List[BetaMessageParam],
    api_key: str,
    only_n_most_recent_images: Optional[int] = None,
    max_tokens: int = 4096,
    tool_version: Optional[ToolVersion] = None,
    thinking_budget: Optional[int] = None,
    token_efficient_tools_beta: bool = False,
    playwright_page: Page,
) -> List[BetaMessageParam]:
    selected_version = tool_version or DEFAULT_TOOL_VERSION
    tool_group = TOOL_GROUPS_BY_VERSION[selected_version]
    tool_collection = ToolCollection(
        *[tool(playwright_page) for tool in tool_group.tools]
    )

    system: BetaTextBlock = {
        "type": "text",
        "text": f"{SYSTEM_PROMPT}{f' {system_prompt_suffix}' if system_prompt_suffix else ''}",
    }

    while True:
        betas: List[str] = [tool_group.beta_flag] if tool_group.beta_flag else []
        
        if token_efficient_tools_beta:
            betas.append("token-efficient-tools-2025-02-19")

        image_truncation_threshold = only_n_most_recent_images or 0

        client = AsyncAnthropic(api_key=api_key, max_retries=4)
        enable_prompt_caching = True
        
        if enable_prompt_caching:
            betas.append(PROMPT_CACHING_BETA_FLAG)
            inject_prompt_caching(messages)
            only_n_most_recent_images = 0
            system["cache_control"] = {"type": "ephemeral"}

        if only_n_most_recent_images:
            maybe_filter_to_n_most_recent_images(
                messages,
                only_n_most_recent_images,
                image_truncation_threshold,
            )

        extra_body: Dict[str, Any] = {}
        if thinking_budget:
            extra_body["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget}

        tool_params = tool_collection.toParams()

        response = await client.beta.messages.create(
            max_tokens=max_tokens,
            messages=messages,
            model=model,
            system=[system],
            tools=tool_params,
            betas=betas,
            **extra_body,
        )

        response_params = response_to_params(response)
        
        loggable_content = [
            {
                "type": "tool_use",
                "name": block["name"],
                "input": block["input"],
            } if block["type"] == "tool_use" else block
            for block in response_params
        ]
        print("=== LLM RESPONSE ===")
        print("Stop reason:", response.stop_reason)
        print(loggable_content)
        print("===")
        
        messages.append({
            "role": "assistant",
            "content": response_params,
        })

        if response.stop_reason == "end_turn":
            print("LLM has completed its task, ending loop")
            return messages

        tool_result_content = []
        has_tool_use = False
        
        for content_block in response_params:
            if (
                content_block["type"] == "tool_use"
                and content_block.get("name")
                and content_block.get("input")
                and isinstance(content_block["input"], dict)
            ):
                input_data = content_block["input"]
                if "action" in input_data and isinstance(input_data["action"], str):
                    has_tool_use = True
                    tool_input: ActionParams = {
                        "action": Action(input_data["action"]),
                        **{
                            k: v for k, v in input_data.items()
                            if k != "action"
                        },
                    }
                    
                    try:
                        result = await tool_collection.run(
                            content_block["name"],
                            tool_input,
                        )

                        tool_result = make_api_tool_result(
                            result,
                            content_block["id"],
                        )
                        tool_result_content.append(tool_result)
                    except Exception as e:
                        print(f"Error running tool: {e}")
                        raise

        if (
            not tool_result_content
            and not has_tool_use
            and response.stop_reason != "tool_use"
        ):
            print("No tool use or results, and not waiting for tool use, ending loop")
            return messages

        if tool_result_content:
            messages.append({
                "role": "user",
                "content": tool_result_content,
            }) 