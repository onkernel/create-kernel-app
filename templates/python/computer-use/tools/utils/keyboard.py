class KeyboardUtils:
    # Only map alternative names to standard Playwright modifier keys
    _modifier_key_map = {
        'ctrl': 'Control',
        'alt': 'Alt',
        'command': 'Meta',
        'win': 'Meta',
    }

    # Essential key mappings for Playwright compatibility
    _key_map = {
        'return': 'Enter',
        'space': ' ',
        'left': 'ArrowLeft',
        'right': 'ArrowRight',
        'up': 'ArrowUp',
        'down': 'ArrowDown',
        'home': 'Home',
        'end': 'End',
        'pageup': 'PageUp',
        'pagedown': 'PageDown',
        'delete': 'Delete',
        'backspace': 'Backspace',
        'tab': 'Tab',
        'esc': 'Escape',
        'escape': 'Escape',
        'insert': 'Insert',
        'f1': 'F1',
        'f2': 'F2',
        'f3': 'F3',
        'f4': 'F4',
        'f5': 'F5',
        'f6': 'F6',
        'f7': 'F7',
        'f8': 'F8',
        'f9': 'F9',
        'f10': 'F10',
        'f11': 'F11',
        'f12': 'F12',
    }

    @staticmethod
    def is_modifier_key(key: str | None) -> bool:
        """Check if the given key is a modifier key."""
        if not key:
            return False
        normalized_key = KeyboardUtils._modifier_key_map.get(key.lower(), key)
        return normalized_key in ['Control', 'Alt', 'Shift', 'Meta']

    @staticmethod
    def get_playwright_key(key: str | None) -> str:
        """Convert a key to its Playwright-compatible representation."""
        if not key:
            raise ValueError('Key cannot be None')

        normalized_key = key.lower()

        # Handle special cases
        if normalized_key in KeyboardUtils._key_map:
            return KeyboardUtils._key_map[normalized_key]

        # Normalize modifier keys
        if normalized_key in KeyboardUtils._modifier_key_map:
            return KeyboardUtils._modifier_key_map[normalized_key]

        # Return the key as is - Playwright handles standard key names
        return key

    @staticmethod
    def parse_key_combination(combo: str) -> list[str]:
        """Parse a key combination string into a list of Playwright-compatible keys."""
        if not combo:
            raise ValueError('Key combination cannot be empty')

        keys = []
        for key in combo.lower().split('+'):
            trimmed_key = key.strip()
            if not trimmed_key:
                raise ValueError('Invalid key combination: empty key')
            keys.append(KeyboardUtils.get_playwright_key(trimmed_key))
        return keys
