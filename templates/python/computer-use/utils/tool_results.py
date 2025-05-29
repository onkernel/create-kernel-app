from typing import TypedDict, List, Union, Optional, Literal

class ToolResult(TypedDict):
    error: Optional[str]
    output: Optional[str]
    base64_image: Optional[str]
    system: Optional[str]

class Base64ImageSource(TypedDict):
    type: Literal["base64"]
    media_type: Literal["image/png"]
    data: str

class ImageBlock(TypedDict):
    type: Literal["image"]
    source: Base64ImageSource

class TextBlock(TypedDict):
    type: Literal["text"]
    text: str

class ToolResultBlock(TypedDict):
    type: Literal["tool_result"]
    content: List[Union[TextBlock, ImageBlock]]
    tool_use_id: str
    is_error: bool


def make_api_tool_result(result: ToolResult, tool_use_id: str) -> ToolResultBlock:
    """Convert low-level *ToolResult* into Anthropic tool_result block.

    Accepts either a mapping (``dict``/``TypedDict``) or the class-based
    ``ToolResult`` we defined in *tools.types.computer*.
    """

    def _get(res: ToolResult, *names: str):  # noqa: D401 – helper
        """Return the first present attribute/key of *res* from *names*."""
        for name in names:
            if isinstance(res, dict) and name in res:
                return res[name]
            if not isinstance(res, dict) and hasattr(res, name):
                return getattr(res, name)
        return None

    tool_result_content: List[Union[TextBlock, ImageBlock]] = []

    error_val = _get(result, "error")
    output_val = _get(result, "output")
    base64_val = _get(result, "base64_image", "base64Image")
    system_val = _get(result, "system")

    is_error = bool(error_val)

    if error_val is not None:
        tool_result_content.append({
            "type": "text",
            "text": maybe_prepend_system_tool_result({"system": system_val} if system_val else {}, str(error_val))
        })
    else:
        if output_val is not None:
            tool_result_content.append({
                "type": "text",
                "text": maybe_prepend_system_tool_result({"system": system_val} if system_val else {}, str(output_val))
            })
        if base64_val is not None:
            tool_result_content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": base64_val,
                },
            })

    return {
        "type": "tool_result",
        "content": tool_result_content,
        "tool_use_id": tool_use_id,
        "is_error": is_error,
    }


def maybe_prepend_system_tool_result(result: ToolResult, result_text: str) -> str:
    if result.get("system"):
        return f"<system>{result['system']}</system>\n{result_text}"
    return result_text 