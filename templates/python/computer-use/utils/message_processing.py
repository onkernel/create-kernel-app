from typing import List, Dict, Any, Optional, Union, TypedDict, Literal
from custom_types.beta import BetaMessageParam as BetaMessageParamType

# Type definitions
class BetaContentBlock(TypedDict, total=False):
    type: str
    text: Optional[str]
    thinking: Optional[str]
    signature: Optional[str]
    cache_control: Optional[Dict[str, str]]

class BetaToolResultBlock(TypedDict):
    type: Literal['tool_result']
    content: List[Any]

class BetaMessage(TypedDict):
    content: List[BetaContentBlock]

# Use the dataclass definition from custom_types/beta.py
BetaMessageParam = BetaMessageParamType


def response_to_params(response: BetaMessage) -> List[BetaContentBlock]:
    """Convert a BetaMessage response to a list of BetaContentBlock.

    Handles both mapping-style objects (``dict`` / ``TypedDict``) and the
    dataclass objects returned by the official *anthropic* SDK.
    """
    # Support both dictionary-style and attribute-style access
    raw_content = None
    if isinstance(response, dict):
        raw_content = response.get('content')
    else:
        # Fall back to attribute access – ``getattr`` avoids AttributeError
        raw_content = getattr(response, 'content', None)

    if raw_content is None:
        raise ValueError("Response object does not contain 'content' field")

    processed_blocks: List[BetaContentBlock] = []
    for block in raw_content:
        # Normalise to mapping so we can use .get safely
        block_dict = block if isinstance(block, dict) else block.model_dump() if hasattr(block, 'model_dump') else vars(block)

        if block_dict.get('type') == 'text' and block_dict.get('text'):
            processed_blocks.append({'type': 'text', 'text': block_dict['text']})
        elif block_dict.get('type') == 'thinking':
            cleaned = {k: v for k, v in block_dict.items() if k not in ('thinking', 'signature')}
            cleaned['thinking'] = block_dict.get('thinking')
            if block_dict.get('signature'):
                cleaned['signature'] = block_dict['signature']
            processed_blocks.append(cleaned)  # type: ignore[arg-type]
        else:
            processed_blocks.append(block_dict)  # type: ignore[arg-type]

    return processed_blocks


def maybe_filter_to_n_most_recent_images(
    messages: List[BetaMessageParam],
    images_to_keep: int,
    min_removal_threshold: int
) -> None:
    """Filter messages to keep only the N most recent images."""
    if not images_to_keep:
        return

    # Get all tool result blocks
    tool_result_blocks = [
        item for message in messages
        if isinstance(message, dict) and isinstance(message.get('content'), list)
        for item in message['content']
        if isinstance(item, dict) and item.get('type') == 'tool_result'
    ]

    # Count total images
    total_images = sum(
        sum(1 for content in tool_result.get('content', [])
            if isinstance(content, dict) and content.get('type') == 'image')
        for tool_result in tool_result_blocks
        if isinstance(tool_result.get('content'), list)
    )

    images_to_remove = (total_images - images_to_keep) // min_removal_threshold * min_removal_threshold

    # Filter images from tool results
    for tool_result in tool_result_blocks:
        if isinstance(tool_result.get('content'), list):
            tool_result['content'] = [
                content for content in tool_result['content']
                if not (isinstance(content, dict) and content.get('type') == 'image' and images_to_remove > 0 and (images_to_remove := images_to_remove - 1, True)[1])
            ]


PROMPT_CACHING_BETA_FLAG = 'prompt-caching-2024-07-31'


def inject_prompt_caching(messages: List[BetaMessageParam]) -> None:
    """Inject prompt caching control into messages."""
    breakpoints_remaining = 3

    for message in reversed(messages):
        if not message or message.get('role') != 'user' or not isinstance(message.get('content'), list):
            continue

        if breakpoints_remaining > 0:
            breakpoints_remaining -= 1
            last_content = message['content'][-1] if message['content'] else None
            if last_content and isinstance(last_content, dict):
                last_content['cache_control'] = {'type': 'ephemeral'}
        else:
            last_content = message['content'][-1] if message['content'] else None
            if last_content and isinstance(last_content, dict):
                last_content.pop('cache_control', None)
            break


__all__ = [
    'response_to_params',
    'maybe_filter_to_n_most_recent_images',
    'inject_prompt_caching',
    'PROMPT_CACHING_BETA_FLAG'
] 