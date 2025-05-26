import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export enum Action_20241022 {
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
}

export enum Action_20250124 {
  // Include all actions from 20241022
  KEY = Action_20241022.KEY,
  TYPE = Action_20241022.TYPE,
  MOUSE_MOVE = Action_20241022.MOUSE_MOVE,
  LEFT_CLICK = Action_20241022.LEFT_CLICK,
  LEFT_CLICK_DRAG = Action_20241022.LEFT_CLICK_DRAG,
  RIGHT_CLICK = Action_20241022.RIGHT_CLICK,
  MIDDLE_CLICK = Action_20241022.MIDDLE_CLICK,
  DOUBLE_CLICK = Action_20241022.DOUBLE_CLICK,
  TRIPLE_CLICK = Action_20241022.TRIPLE_CLICK,
  SCREENSHOT = Action_20241022.SCREENSHOT,
  CURSOR_POSITION = Action_20241022.CURSOR_POSITION,
  // Add new actions
  LEFT_MOUSE_DOWN = 'left_mouse_down',
  LEFT_MOUSE_UP = 'left_mouse_up',
  SCROLL = 'scroll',
  HOLD_KEY = 'hold_key',
  WAIT = 'wait',
}

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

const execAsync = promisify(exec);

const OUTPUT_DIR = '/tmp/outputs';
const TYPING_DELAY_MS = 12;
const TYPING_GROUP_SIZE = 50;

type ScrollDirection = 'up' | 'down' | 'left' | 'right';

interface Resolution {
  width: number;
  height: number;
}

const MAX_SCALING_TARGETS: Record<string, Resolution> = {
  XGA: { width: 1024, height: 768 }, // 4:3
  WXGA: { width: 1280, height: 800 }, // 16:10
  FWXGA: { width: 1366, height: 768 }, // ~16:9
};

const CLICK_BUTTONS: Record<string, number | string> = {
  left_click: 1,
  right_click: 3,
  middle_click: 2,
  double_click: '--repeat 2 --delay 10 1',
  triple_click: '--repeat 3 --delay 10 1',
};

enum ScalingSource {
  COMPUTER = 'computer',
  API = 'api',
}

interface ComputerToolOptions {
  display_height_px: number;
  display_width_px: number;
  display_number: number | null;
}

function chunks(s: string, chunkSize: number): string[] {
  return Array.from({ length: Math.ceil(s.length / chunkSize) }, (_, i) =>
    s.slice(i * chunkSize, (i + 1) * chunkSize)
  );
}

export class BaseComputerTool {
  name: 'computer' = 'computer';
  width: number;
  height: number;
  displayNum: number | null;
  protected _screenshotDelay = 2.0;
  protected _scalingEnabled = true;
  protected _displayPrefix: string;
  protected xdotool: string;

  constructor() {
    this.width = parseInt(process.env.WIDTH || '0');
    this.height = parseInt(process.env.HEIGHT || '0');
    
    if (!this.width || !this.height) {
      throw new Error('WIDTH, HEIGHT must be set');
    }

    const displayNum = process.env.DISPLAY_NUM;
    if (displayNum !== undefined) {
      this.displayNum = parseInt(displayNum);
      this._displayPrefix = `DISPLAY=:${this.displayNum} `;
    } else {
      this.displayNum = null;
      this._displayPrefix = '';
    }

    this.xdotool = `${this._displayPrefix}xdotool`;
  }

  get options(): ComputerToolOptions {
    const [width, height] = this.scaleCoordinates(
      ScalingSource.COMPUTER,
      this.width,
      this.height
    );
    return {
      display_width_px: width,
      display_height_px: height,
      display_number: this.displayNum,
    };
  }

  protected async shell(command: string, takeScreenshot = true): Promise<ToolResult> {
    try {
      const { stdout, stderr } = await execAsync(command);
      let base64Image: string | undefined;

      if (takeScreenshot) {
        await new Promise(resolve => setTimeout(resolve, this._screenshotDelay * 1000));
        base64Image = (await this.screenshot()).base64Image;
      }

      return { output: stdout, error: stderr, base64Image };
    } catch (error) {
      throw new ToolError(`Command failed: ${error}`);
    }
  }

  protected validateAndGetCoordinates(coordinate: [number, number] | null = null): [number, number] {
    if (!Array.isArray(coordinate) || coordinate.length !== 2) {
      throw new ToolError(`${coordinate} must be a tuple of length 2`);
    }
    if (!coordinate.every(i => typeof i === 'number' && i >= 0)) {
      throw new ToolError(`${coordinate} must be a tuple of non-negative numbers`);
    }

    return this.scaleCoordinates(ScalingSource.API, coordinate[0], coordinate[1]);
  }

  protected scaleCoordinates(source: ScalingSource, x: number, y: number): [number, number] {
    if (!this._scalingEnabled) {
      return [x, y];
    }

    const ratio = this.width / this.height;
    let targetDimension: Resolution | null = null;

    for (const dimension of Object.values(MAX_SCALING_TARGETS)) {
      if (Math.abs(dimension.width / dimension.height - ratio) < 0.02) {
        if (dimension.width < this.width) {
          targetDimension = dimension;
        }
        break;
      }
    }

    if (!targetDimension) {
      return [x, y];
    }

    const xScalingFactor = targetDimension.width / this.width;
    const yScalingFactor = targetDimension.height / this.height;

    if (source === ScalingSource.API) {
      if (x > this.width || y > this.height) {
        throw new ToolError(`Coordinates ${x}, ${y} are out of bounds`);
      }
      return [Math.round(x / xScalingFactor), Math.round(y / yScalingFactor)];
    }

    return [Math.round(x * xScalingFactor), Math.round(y * yScalingFactor)];
  }

  async screenshot(): Promise<ToolResult> {
    const outputDir = OUTPUT_DIR;
    await mkdir(outputDir, { recursive: true });
    const path = join(outputDir, `screenshot_${uuidv4()}.png`);

    let screenshotCmd: string;
    if (existsSync('/usr/bin/gnome-screenshot')) {
      screenshotCmd = `${this._displayPrefix}gnome-screenshot -f ${path} -p`;
    } else {
      screenshotCmd = `${this._displayPrefix}scrot -p ${path}`;
    }

    const result = await this.shell(screenshotCmd, false);
    
    if (this._scalingEnabled) {
      const [x, y] = this.scaleCoordinates(ScalingSource.COMPUTER, this.width, this.height);
      await this.shell(`convert ${path} -resize ${x}x${y}! ${path}`, false);
    }

    if (existsSync(path)) {
      const imageBuffer = await readFile(path);
      return {
        ...result,
        base64Image: imageBuffer.toString('base64'),
      };
    }

    throw new ToolError(`Failed to take screenshot: ${result.error}`);
  }

  async call(params: {
    action: Action_20241022 | Action_20250124;
    text?: string;
    coordinate?: [number, number];
    scrollDirection?: ScrollDirection;
    scrollAmount?: number;
    duration?: number;
    key?: string;
    [key: string]: any;
  }): Promise<ToolResult> {
    const { action, text, coordinate, ...kwargs } = params;

    if (action === Action_20241022.MOUSE_MOVE || action === Action_20241022.LEFT_CLICK_DRAG) {
      if (!coordinate) {
        throw new ToolError(`coordinate is required for ${action}`);
      }
      if (text !== undefined) {
        throw new ToolError(`text is not accepted for ${action}`);
      }

      const [x, y] = this.validateAndGetCoordinates(coordinate);

      if (action === Action_20241022.MOUSE_MOVE) {
        return await this.shell(`${this.xdotool} mousemove --sync ${x} ${y}`);
      } else {
        return await this.shell(
          `${this.xdotool} mousedown 1 mousemove --sync ${x} ${y} mouseup 1`
        );
      }
    }

    if (action === Action_20241022.KEY || action === Action_20241022.TYPE) {
      if (text === undefined) {
        throw new ToolError(`text is required for ${action}`);
      }
      if (coordinate !== undefined) {
        throw new ToolError(`coordinate is not accepted for ${action}`);
      }
      if (typeof text !== 'string') {
        throw new ToolError(`${text} must be a string`);
      }

      if (action === Action_20241022.KEY) {
        return await this.shell(`${this.xdotool} key -- ${text}`);
      } else {
        const results: ToolResult[] = [];
        for (const chunk of chunks(text, TYPING_GROUP_SIZE)) {
          const escapedChunk = chunk.replace(/'/g, "'\\''");
          results.push(
            await this.shell(
              `${this.xdotool} type --delay ${TYPING_DELAY_MS} -- '${escapedChunk}'`,
              false
            )
          );
        }
        const screenshot = await this.screenshot();
        return {
          output: results.map(r => r.output || '').join(''),
          error: results.map(r => r.error || '').join(''),
          base64Image: screenshot.base64Image,
        };
      }
    }

    if ([
      Action_20241022.LEFT_CLICK,
      Action_20241022.RIGHT_CLICK,
      Action_20241022.DOUBLE_CLICK,
      Action_20241022.MIDDLE_CLICK,
      Action_20241022.SCREENSHOT,
      Action_20241022.CURSOR_POSITION,
    ].includes(action as Action_20241022)) {
      if (text !== undefined) {
        throw new ToolError(`text is not accepted for ${action}`);
      }
      if (coordinate !== undefined) {
        throw new ToolError(`coordinate is not accepted for ${action}`);
      }

      if (action === Action_20241022.SCREENSHOT) {
        return await this.screenshot();
      } else if (action === Action_20241022.CURSOR_POSITION) {
        const result = await this.shell(`${this.xdotool} getmouselocation --shell`, false);
        const output = result.output || '';
        const xMatch = output.match(/X=(\d+)/);
        const yMatch = output.match(/Y=(\d+)/);
        
        if (!xMatch?.[1] || !yMatch?.[1]) {
          throw new ToolError('Failed to parse cursor position');
        }
        
        const x = parseInt(xMatch[1], 10);
        const y = parseInt(yMatch[1], 10);
        
        if (isNaN(x) || isNaN(y)) {
          throw new ToolError('Invalid cursor position values');
        }
        
        const [scaledX, scaledY] = this.scaleCoordinates(ScalingSource.COMPUTER, x, y);
        return { ...result, output: `X=${scaledX},Y=${scaledY}` };
      } else {
        return await this.shell(`${this.xdotool} click ${CLICK_BUTTONS[action]}`);
      }
    }

    throw new ToolError(`Invalid action: ${action}`);
  }
}

export class ComputerTool20241022 extends BaseComputerTool implements BaseAnthropicTool {
  apiType: 'computer_20241022' = 'computer_20241022';

  toParams(): any {
    return {
      name: this.name,
      type: this.apiType,
      ...this.options,
    };
  }
}

export class ComputerTool20250124 extends BaseComputerTool implements BaseAnthropicTool {
  apiType: 'computer_20250124' = 'computer_20250124';

  toParams(): any {
    return {
      name: this.name,
      type: this.apiType,
      ...this.options,
    };
  }

  async call(params: {
    action: Action_20250124;
    text?: string;
    coordinate?: [number, number];
    scrollDirection?: ScrollDirection;
    scrollAmount?: number;
    duration?: number;
    key?: string;
    [key: string]: any;
  }): Promise<ToolResult> {
    const { action, text, coordinate, scrollDirection, scrollAmount, duration, key, ...kwargs } = params;

    if (action === Action_20250124.LEFT_MOUSE_DOWN || action === Action_20250124.LEFT_MOUSE_UP) {
      if (coordinate !== undefined) {
        throw new ToolError(`coordinate is not accepted for ${action}`);
      }
      const command = `${this.xdotool} ${action === Action_20250124.LEFT_MOUSE_DOWN ? 'mousedown' : 'mouseup'} 1`;
      return await this.shell(command);
    }

    if (action === Action_20250124.SCROLL) {
      if (!scrollDirection || !['up', 'down', 'left', 'right'].includes(scrollDirection)) {
        throw new ToolError(`${scrollDirection} must be 'up', 'down', 'left', or 'right'`);
      }
      if (typeof scrollAmount !== 'number' || scrollAmount < 0) {
        throw new ToolError(`${scrollAmount} must be a non-negative number`);
      }

      let mouseMovePart = '';
      if (coordinate !== undefined) {
        const [x, y] = this.validateAndGetCoordinates(coordinate);
        mouseMovePart = `mousemove --sync ${x} ${y}`;
      }

      const scrollButton = {
        up: 4,
        down: 5,
        left: 6,
        right: 7,
      }[scrollDirection];

      const commandParts = [this.xdotool, mouseMovePart];
      if (text) {
        commandParts.push(`keydown ${text}`);
      }
      commandParts.push(`click --repeat ${scrollAmount} ${scrollButton}`);
      if (text) {
        commandParts.push(`keyup ${text}`);
      }

      return await this.shell(commandParts.join(' '));
    }

    if (action === Action_20250124.HOLD_KEY || action === Action_20250124.WAIT) {
      if (duration === undefined || typeof duration !== 'number') {
        throw new ToolError(`${duration} must be a number`);
      }
      if (duration < 0) {
        throw new ToolError(`${duration} must be non-negative`);
      }
      if (duration > 100) {
        throw new ToolError(`${duration} is too long`);
      }

      if (action === Action_20250124.HOLD_KEY) {
        if (text === undefined) {
          throw new ToolError(`text is required for ${action}`);
        }
        const escapedKeys = text.replace(/'/g, "'\\''");
        const commandParts = [
          this.xdotool,
          `keydown '${escapedKeys}'`,
          `sleep ${duration}`,
          `keyup '${escapedKeys}'`,
        ];
        return await this.shell(commandParts.join(' '));
      }

      if (action === Action_20250124.WAIT) {
        await new Promise(resolve => setTimeout(resolve, duration * 1000));
        return await this.screenshot();
      }
    }

    if ([
      Action_20250124.LEFT_CLICK,
      Action_20250124.RIGHT_CLICK,
      Action_20250124.DOUBLE_CLICK,
      Action_20250124.TRIPLE_CLICK,
      Action_20250124.MIDDLE_CLICK,
    ].includes(action)) {
      if (text !== undefined) {
        throw new ToolError(`text is not accepted for ${action}`);
      }

      let mouseMovePart = '';
      if (coordinate !== undefined) {
        const [x, y] = this.validateAndGetCoordinates(coordinate);
        mouseMovePart = `mousemove --sync ${x} ${y}`;
      }

      const commandParts = [this.xdotool, mouseMovePart];
      if (key) {
        commandParts.push(`keydown ${key}`);
      }
      commandParts.push(`click ${CLICK_BUTTONS[action]}`);
      if (key) {
        commandParts.push(`keyup ${key}`);
      }

      return await this.shell(commandParts.join(' '));
    }

    return await super.call(params);
  }
}
