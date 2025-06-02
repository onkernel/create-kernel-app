from dataclasses import dataclass
from typing import Literal, Union, Optional, List, Dict, Any
from typing import TypedDict

@dataclass
class BetaTextBlock:
    type: Literal['text']
    text: str
    id: Optional[str] = None
    cache_control: Optional[Dict[Literal['type'], Literal['ephemeral']]] = None

@dataclass
class BetaImageSource:
    type: Literal['base64']
    media_type: Literal['image/png']
    data: str

@dataclass
class BetaImageBlock:
    type: Literal['image']
    source: BetaImageSource
    id: Optional[str] = None
    cache_control: Optional[Dict[Literal['type'], Literal['ephemeral']]] = None

@dataclass
class BetaToolUseBlock:
    type: Literal['tool_use']
    name: str
    input: Dict[str, Any]  # ActionParams type
    id: Optional[str] = None
    cache_control: Optional[Dict[Literal['type'], Literal['ephemeral']]] = None

class BetaThinkingEnabled(TypedDict):
    type: Literal['enabled']
    budget_tokens: int

class BetaThinkingDisabled(TypedDict):
    type: Literal['disabled']

@dataclass
class BetaThinkingBlock:
    type: Literal['thinking']
    thinking: Union[BetaThinkingEnabled, BetaThinkingDisabled]
    signature: Optional[str] = None
    id: Optional[str] = None
    cache_control: Optional[Dict[Literal['type'], Literal['ephemeral']]] = None

@dataclass
class BetaToolResultBlock:
    type: Literal['tool_result']
    content: Union[List[Union[BetaTextBlock, BetaImageBlock]], str]
    tool_use_id: str
    is_error: bool
    id: Optional[str] = None
    cache_control: Optional[Dict[Literal['type'], Literal['ephemeral']]] = None

# Define BetaLocalContentBlock before BetaMessageParam
BetaLocalContentBlock = Union[BetaTextBlock, BetaImageBlock, BetaToolUseBlock, BetaThinkingBlock, BetaToolResultBlock]

@dataclass
class BetaMessageParam:
    role: Literal['user', 'assistant']
    content: List[BetaLocalContentBlock]
    id: Optional[str] = None