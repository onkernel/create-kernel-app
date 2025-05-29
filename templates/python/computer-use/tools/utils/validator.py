from typing import Optional, Set, Tuple, Union
from tools.types.computer import Action, ActionParams, Coordinate, Duration, ToolError

class ActionValidator:
    @staticmethod
    def validate_text(text: Optional[str], required: bool, action: str) -> None:
        if required and text is None:
            raise ToolError(f"text is required for {action}")
        if text is not None and not isinstance(text, str):
            raise ToolError(f"{text} must be a string")

    @staticmethod
    def validate_coordinate(coordinate: Optional[Coordinate], required: bool, action: str) -> None:
        if required and coordinate is None:
            raise ToolError(f"coordinate is required for {action}")
        if coordinate is not None:
            ActionValidator.validate_and_get_coordinates(coordinate)

    @staticmethod
    def validate_duration(duration: Optional[Duration]) -> None:
        if duration is None or not isinstance(duration, (int, float)):
            raise ToolError(f"{duration} must be a number")
        if duration < 0:
            raise ToolError(f"{duration} must be non-negative")
        if duration > 100:
            raise ToolError(f"{duration} is too long")

    @staticmethod
    def validate_and_get_coordinates(coordinate: Coordinate) -> Coordinate:
        # Accept both 2-item tuples and lists for convenience
        if isinstance(coordinate, list):
            coordinate = tuple(coordinate)

        if not isinstance(coordinate, tuple) or len(coordinate) != 2:
            raise ToolError(f"{coordinate} must be a tuple or list of length 2")

        if not all(isinstance(i, (int, float)) and i >= 0 for i in coordinate):
            raise ToolError(f"{coordinate} must contain non-negative numbers")

        return coordinate

    @staticmethod
    def validate_action_params(params: ActionParams, mouse_actions: Set[Action], keyboard_actions: Set[Action]) -> None:
        action = params.action
        text = params.text
        coordinate = params.coordinate
        duration = params.duration

        # Validate text parameter
        if action in keyboard_actions:
            ActionValidator.validate_text(text, True, action.value)
        else:
            ActionValidator.validate_text(text, False, action.value)

        # Validate coordinate parameter
        if action in mouse_actions:
            ActionValidator.validate_coordinate(coordinate, True, action.value)
        else:
            ActionValidator.validate_coordinate(coordinate, False, action.value)

        # Validate duration parameter
        if action in (Action.HOLD_KEY, Action.WAIT):
            ActionValidator.validate_duration(duration)
