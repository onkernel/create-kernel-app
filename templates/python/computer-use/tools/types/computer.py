from enum import Enum
from typing import Literal, Tuple, Union, Dict, Any, Optional, TypeVar

class Action(Enum):
    # Mouse actions
    MOUSE_MOVE = 'mouse_move'
    LEFT_CLICK = 'left_click'
    RIGHT_CLICK = 'right_click'
    MIDDLE_CLICK = 'middle_click'
    DOUBLE_CLICK = 'double_click'
    TRIPLE_CLICK = 'triple_click'
    LEFT_CLICK_DRAG = 'left_click_drag'
    LEFT_MOUSE_DOWN = 'left_mouse_down'
    LEFT_MOUSE_UP = 'left_mouse_up'

    # Keyboard actions
    KEY = 'key'
    TYPE = 'type'
    HOLD_KEY = 'hold_key'

    # System actions
    SCREENSHOT = 'screenshot'
    CURSOR_POSITION = 'cursor_position'
    SCROLL = 'scroll'
    WAIT = 'wait'

# For backward compatibility
Action_20241022 = Action
Action_20250124 = Action

MouseButton = Literal['left', 'right', 'middle']
ScrollDirection = Literal['up', 'down', 'left', 'right']
Coordinate = Tuple[int, int]
Duration = float

class ActionParams:
    def __init__(
        self,
        action: Action,
        text: Optional[str] = None,
        coordinate: Optional[Coordinate] = None,
        scrollDirection: Optional[ScrollDirection] = None,
        scroll_amount: Optional[int] = None,
        scrollAmount: Optional[int] = None,
        duration: Optional[Duration] = None,
        key: Optional[str] = None,
        **kwargs: Any
    ):
        self.action = action
        self.text = text
        self.coordinate = coordinate
        self.scrollDirection = scrollDirection
        self.scroll_amount = scroll_amount
        self.scrollAmount = scrollAmount
        self.duration = duration
        self.key = key
        for key, value in kwargs.items():
            setattr(self, key, value)

class ToolResult:
    def __init__(
        self,
        output: Optional[str] = None,
        error: Optional[str] = None,
        base64Image: Optional[str] = None,
        system: Optional[str] = None
    ):
        self.output = output
        self.error = error
        self.base64Image = base64Image
        self.system = system

class BaseAnthropicTool:
    def __init__(self, name: str, apiType: str):
        self.name = name
        self.apiType = apiType

    def toParams(self) -> ActionParams:
        raise NotImplementedError("Subclasses must implement toParams()")

class ToolError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.name = 'ToolError'
