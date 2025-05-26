import type { Page } from 'playwright';

export enum Action {
  // Base actions
  KEY = 'key',
  TYPE = 'type',
  MOUSE_MOVE = 'mouse_move',
  LEFT_CLICK = 'left_click',
  LEFT_CLICK_DRAG = 'left_click_drag',
  RIGHT_CLICK = 'right_click',
  MIDDLE_CLICK = 'middle_click',
  DOUBLE_CLICK = 'double_click',
  TRIPLE_CLICK = 'triple_click',
  SCREENSHOT = 'screenshot',
  CURSOR_POSITION = 'cursor_position',
  // Extended actions (20250124)
  LEFT_MOUSE_DOWN = 'left_mouse_down',
  LEFT_MOUSE_UP = 'left_mouse_up',
  SCROLL = 'scroll',
  HOLD_KEY = 'hold_key',
  WAIT = 'wait',
}

// For backward compatibility
export type Action_20241022 = Action;
export type Action_20250124 = Action;

export interface ToolResult {
  output?: string;
  error?: string;
  base64Image?: string;
  system?: string;
}

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export interface BaseAnthropicTool {
  name: string;
  apiType: string;
  toParams(): any;
}

const TYPING_DELAY_MS = 12;

type ScrollDirection = 'up' | 'down' | 'left' | 'right';

export class ComputerTool implements BaseAnthropicTool {
  name: 'computer' = 'computer';
  protected page: Page;
  protected _screenshotDelay = 2.0;
  protected version: '20241022' | '20250124';

  constructor(page: Page, version: '20241022' | '20250124' = '20250124') {
    this.page = page;
    this.version = version;
  }

  get apiType(): 'computer_20241022' | 'computer_20250124' {
    return this.version === '20241022' ? 'computer_20241022' : 'computer_20250124';
  }

  toParams(): any {
    const params = {
      name: this.name,
      type: this.apiType,
      display_width_px: 1280,
      display_height_px: 720,
      display_number: null,
    };
    console.log('ComputerTool toParams:', JSON.stringify(params, null, 2));
    return params;
  }

  protected validateAndGetCoordinates(coordinate: [number, number] | null = null): [number, number] {
    if (!Array.isArray(coordinate) || coordinate.length !== 2) {
      throw new ToolError(`${coordinate} must be a tuple of length 2`);
    }
    if (!coordinate.every(i => typeof i === 'number' && i >= 0)) {
      throw new ToolError(`${coordinate} must be a tuple of non-negative numbers`);
    }
    return coordinate;
  }

  async screenshot(): Promise<ToolResult> {
    try {
      await new Promise(resolve => setTimeout(resolve, this._screenshotDelay * 1000));
      const screenshot = await this.page.screenshot({ type: 'png' });
      return {
        base64Image: screenshot.toString('base64'),
      };
    } catch (error) {
      throw new ToolError(`Failed to take screenshot: ${error}`);
    }
  }

  async call(params: {
    action: Action;
    text?: string;
    coordinate?: [number, number];
    scrollDirection?: ScrollDirection;
    scrollAmount?: number;
    duration?: number;
    key?: string;
    [key: string]: any;
  }): Promise<ToolResult> {
    console.log('ComputerTool.call called with params:', JSON.stringify(params, null, 2));
    const { action, text, coordinate, scrollDirection, scrollAmount, duration, ...kwargs } = params;

    if (action === Action.SCREENSHOT) {
      this.validateText(text, false, action);
      this.validateCoordinate(coordinate, false, action);
      return await this.screenshot();
    }

    if (action === Action.CURSOR_POSITION) {
      this.validateText(text, false, action);
      this.validateCoordinate(coordinate, false, action);
      const position = await this.page.evaluate(() => {
        const selection = window.getSelection();
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();
        return rect ? { x: rect.x, y: rect.y } : null;
      });
      
      if (!position) {
        throw new ToolError('Failed to get cursor position');
      }
      
      return { output: `X=${position.x},Y=${position.y}` };
    }

    if (action === Action.SCROLL) {
      if (this.version !== '20250124') {
        throw new ToolError(`${action} is only available in version 20250124`);
      }
      if (!scrollDirection || !['up', 'down', 'left', 'right'].includes(scrollDirection)) {
        throw new ToolError(`${scrollDirection} must be 'up', 'down', 'left', or 'right'`);
      }
      if (typeof scrollAmount !== 'number' || scrollAmount < 0) {
        throw new ToolError(`${scrollAmount} must be a non-negative number`);
      }

      if (coordinate) {
        const [x, y] = this.validateAndGetCoordinates(coordinate);
        await this.page.mouse.move(x, y);
      }

      const amount = scrollAmount || 100;
      await this.page.mouse.wheel(0, scrollDirection === 'down' ? amount : -amount);
      return await this.screenshot();
    }

    if (action === Action.WAIT) {
      if (this.version !== '20250124') {
        throw new ToolError(`${action} is only available in version 20250124`);
      }
      this.validateDuration(duration, action);
      await new Promise(resolve => setTimeout(resolve, duration! * 1000));
      return await this.screenshot();
    }

    // Handle mouse movement and drag
    if (action === Action.MOUSE_MOVE || action === Action.LEFT_CLICK_DRAG) {
      this.validateText(text, false, action);
      if (!coordinate) {
        throw new ToolError(`coordinate is required for ${action}`);
      }

      const [x, y] = this.validateAndGetCoordinates(coordinate);
      if (action === Action.MOUSE_MOVE) {
        await this.page.mouse.move(x, y);
      } else {
        await this.page.mouse.down();
        await this.page.mouse.move(x, y);
        await this.page.mouse.up();
      }
      return await this.screenshot();
    }

    // Handle keyboard actions
    if (action === Action.KEY || action === Action.TYPE || action === Action.HOLD_KEY) {
      this.validateText(text, true, action);
      this.validateCoordinate(coordinate, false, action);

      if (action === Action.HOLD_KEY) {
        if (this.version !== '20250124') {
          throw new ToolError(`${action} is only available in version 20250124`);
        }
        this.validateDuration(duration, action);
        await this.page.keyboard.down(text!);
        await new Promise(resolve => setTimeout(resolve, duration! * 1000));
        await this.page.keyboard.up(text!);
      } else if (action === Action.KEY) {
        await this.page.keyboard.press(text!);
      } else {
        await this.page.keyboard.type(text!, { delay: TYPING_DELAY_MS });
      }
      return await this.screenshot();
    }

    // Handle mouse clicks
    if ([
      Action.LEFT_CLICK,
      Action.RIGHT_CLICK,
      Action.DOUBLE_CLICK,
      Action.MIDDLE_CLICK,
      Action.TRIPLE_CLICK,
      Action.LEFT_MOUSE_DOWN,
      Action.LEFT_MOUSE_UP,
    ].includes(action)) {
      this.validateText(text, false, action);
      this.validateCoordinate(coordinate, false, action);

      if (action === Action.LEFT_MOUSE_DOWN || action === Action.LEFT_MOUSE_UP) {
        if (this.version !== '20250124') {
          throw new ToolError(`${action} is only available in version 20250124`);
        }
        if (action === Action.LEFT_MOUSE_DOWN) {
          await this.page.mouse.down();
        } else {
          await this.page.mouse.up();
        }
      } else {
        const button = {
          [Action.LEFT_CLICK]: 'left' as const,
          [Action.RIGHT_CLICK]: 'right' as const,
          [Action.MIDDLE_CLICK]: 'middle' as const,
          [Action.DOUBLE_CLICK]: 'left' as const,
          [Action.TRIPLE_CLICK]: 'left' as const,
        }[action];

        if (action === Action.DOUBLE_CLICK) {
          await this.page.mouse.dblclick(0, 0, { button });
        } else if (action === Action.TRIPLE_CLICK) {
          await this.page.mouse.click(0, 0, { button, clickCount: 3 });
        } else {
          await this.page.mouse.click(0, 0, { button });
        }
      }
      return await this.screenshot();
    }

    throw new ToolError(`Invalid action: ${action}`);
  }

  protected validateText(text: string | undefined, required: boolean, action: string): void {
    if (required && text === undefined) {
      throw new ToolError(`text is required for ${action}`);
    }
    if (text !== undefined && typeof text !== 'string') {
      throw new ToolError(`${text} must be a string`);
    }
  }

  protected validateCoordinate(coordinate: [number, number] | undefined, allowed: boolean, action: string): void {
    if (!allowed && coordinate !== undefined) {
      throw new ToolError(`coordinate is not accepted for ${action}`);
    }
  }

  protected validateDuration(duration: number | undefined, action: string): void {
    if (duration === undefined || typeof duration !== 'number') {
      throw new ToolError(`${duration} must be a number`);
    }
    if (duration < 0) {
      throw new ToolError(`${duration} must be non-negative`);
    }
    if (duration > 100) {
      throw new ToolError(`${duration} is too long`);
    }
  }
}

// For backward compatibility
export class ComputerTool20241022 extends ComputerTool {
  constructor(page: Page) {
    super(page, '20241022');
  }
}

export class ComputerTool20250124 extends ComputerTool {
  constructor(page: Page) {
    super(page, '20250124');
  }
}
