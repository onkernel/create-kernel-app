import { Anthropic } from '@anthropic-ai/sdk';
import { DateTime } from 'luxon';
import type { ToolResult } from './tools/computer';
import { ComputerTool20241022, ComputerTool20250124, Action } from './tools/computer';
import type { Page } from 'playwright';

export type ToolVersion = 'computer_use_20250124' | 'computer_use_20241022' | 'computer_use_20250429';
export type BetaFlag = 'computer-use-2024-10-22' | 'computer-use-2025-01-24' | 'computer-use-2025-04-29';

const DEFAULT_TOOL_VERSION: ToolVersion = 'computer_use_20250124';

interface ToolGroup {
  readonly version: ToolVersion;
  readonly tools: (typeof ComputerTool20241022 | typeof ComputerTool20250124)[];
  readonly beta_flag: BetaFlag | null;
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    version: 'computer_use_20241022',
    tools: [ComputerTool20241022],
    beta_flag: 'computer-use-2024-10-22',
  },
  {
    version: 'computer_use_20250124',
    tools: [ComputerTool20250124],
    beta_flag: 'computer-use-2025-01-24',
  },
  {
    version: 'computer_use_20250429',
    tools: [ComputerTool20250124],
    beta_flag: 'computer-use-2025-01-24',
  },
];

const TOOL_GROUPS_BY_VERSION: Record<ToolVersion, ToolGroup> = Object.fromEntries(
  TOOL_GROUPS.map(group => [group.version, group])
) as Record<ToolVersion, ToolGroup>;

export enum APIProvider {
  ANTHROPIC = 'anthropic'
}

export interface BetaMessageParam {
  role: 'user' | 'assistant';
  content: BetaContentBlockParam[] | string;
}

export interface BetaContentBlockParam {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, any>;
  id?: string;
  cache_control?: {
    type: 'ephemeral';
  };
}

export interface BetaToolResultBlockParam {
  type: 'tool_result';
  content: (BetaTextBlockParam | BetaImageBlockParam)[] | string;
  tool_use_id: string;
  is_error: boolean;
}

export interface BetaTextBlockParam {
  type: 'text';
  text: string;
}

export interface BetaImageBlockParam {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/png';
    data: string;
  };
}

export interface BetaMessage {
  content: Array<{
    type: string;
    text?: string;
    name?: string;
    input?: Record<string, any>;
    id?: string;
    thinking?: any;
    signature?: string;
  }>;
}

const PROMPT_CACHING_BETA_FLAG = 'prompt-caching-2024-07-31';

// System prompt optimized for the environment
const SYSTEM_PROMPT = `<SYSTEM_CAPABILITY>
* You are utilising an Ubuntu virtual machine using ${process.arch} architecture with internet access.
* When you connect to the display, CHROMIUM IS ALREADY OPEN. The url bar is not visible but it is there.
* When viewing a page it can be helpful to zoom out so that you can see everything on the page. Either that, or make sure you scroll down to see everything before deciding something isn't available.
* When using your computer function calls, they take a while to run and send back to you. Where possible/feasible, try to chain multiple of these calls all into one function calls request.
* The current date is ${DateTime.now().toFormat('EEEE, MMMM d, yyyy')}.
</SYSTEM_CAPABILITY>

<IMPORTANT>
* When using Chromium, if a startup wizard appears, IGNORE IT. Do not even click "skip this step". Instead, click on the address bar where it says "Search or enter address", and enter the appropriate search term or URL there.
* If the item you are looking at is a pdf, if after taking a single screenshot of the pdf it seems that you want to read the entire document instead of trying to continue to read the pdf from your screenshots + navigation, determine the URL, use curl to download the pdf, install and use pdftotext to convert it to a text file, and then read that text file directly.
</IMPORTANT>`;

// Tool collection class to manage available tools
class ToolCollection {
  private tools: (ComputerTool20241022 | ComputerTool20250124)[];

  constructor(...tools: (ComputerTool20241022 | ComputerTool20250124)[]) {
    this.tools = tools;
  }

  toParams(): any[] {
    const params = this.tools.map(tool => {
      const toolParams = tool.toParams();
      console.log('Individual tool params:', JSON.stringify(toolParams, null, 2));
      return toolParams;
    });
    console.log('All tool params:', JSON.stringify(params, null, 2));
    return params;
  }

  async run(name: string, toolInput: { action: Action } & Record<string, any>): Promise<ToolResult> {
    const tool = this.tools.find(t => t.name === name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }

    // Type guard to ensure action matches the tool version
    if (tool instanceof ComputerTool20241022) {
      if (!Object.values(Action).includes(toolInput.action)) {
        throw new Error(`Invalid action ${toolInput.action} for tool version 20241022`);
      }
      return await tool.call(toolInput);
    } else if (tool instanceof ComputerTool20250124) {
      if (!Object.values(Action).includes(toolInput.action)) {
        throw new Error(`Invalid action ${toolInput.action} for tool version 20250124`);
      }
      return await tool.call(toolInput);
    }

    throw new Error(`Unsupported tool version for ${name}`);
  }
}

export async function samplingLoop({
  model,
  systemPromptSuffix,
  messages,
  outputCallback,
  toolOutputCallback,
  apiResponseCallback,
  apiKey,
  onlyNMostRecentImages,
  maxTokens = 4096,
  toolVersion,
  thinkingBudget,
  tokenEfficientToolsBeta = false,
  playwrightPage,
}: {
  model: string;
  systemPromptSuffix?: string;
  messages: BetaMessageParam[];
  outputCallback: (block: BetaContentBlockParam) => void;
  toolOutputCallback: (result: ToolResult, id: string) => void;
  apiResponseCallback: (request: any, response: any, error: any) => void;
  apiKey: string;
  onlyNMostRecentImages?: number;
  maxTokens?: number;
  toolVersion?: ToolVersion;
  thinkingBudget?: number;
  tokenEfficientToolsBeta?: boolean;
  playwrightPage: Page;
}): Promise<BetaMessageParam[]> {
  const selectedVersion = toolVersion || DEFAULT_TOOL_VERSION;
  const toolGroup = TOOL_GROUPS_BY_VERSION[selectedVersion];
  const toolCollection = new ToolCollection(...toolGroup.tools.map((Tool: typeof ComputerTool20241022 | typeof ComputerTool20250124) => new Tool(playwrightPage)));
  
  const system: BetaTextBlockParam = {
    type: 'text',
    text: `${SYSTEM_PROMPT}${systemPromptSuffix ? ' ' + systemPromptSuffix : ''}`,
  };

  while (true) {
    const betas: string[] = toolGroup.beta_flag ? [toolGroup.beta_flag] : [];
    
    if (tokenEfficientToolsBeta) {
      betas.push('token-efficient-tools-2025-02-19');
    }

    let imageTruncationThreshold = onlyNMostRecentImages || 0;

    const client = new Anthropic({ apiKey, maxRetries: 4 });
    const enablePromptCaching = true;
    
    if (enablePromptCaching) {
      betas.push(PROMPT_CACHING_BETA_FLAG);
      injectPromptCaching(messages);
      onlyNMostRecentImages = 0;
      (system as any).cache_control = { type: 'ephemeral' };
    }

    if (onlyNMostRecentImages) {
      maybeFilterToNMostRecentImages(
        messages,
        onlyNMostRecentImages,
        imageTruncationThreshold
      );
    }

    const extraBody: Record<string, any> = {};
    if (thinkingBudget) {
      extraBody.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
    }

    const toolParams = toolCollection.toParams();
    console.log('=== TOOL AVAILABILITY ===');
    console.log('Tools being sent to AI:', JSON.stringify(toolParams, null, 2));
    console.log('Available actions:', Object.values(Action));
    console.log('=======================');

    try {
      // Use beta API for messages
      console.log('=== AI REQUEST ===');
      console.log('Messages being sent:', messages.map(m => ({
        role: m.role,
        content: Array.isArray(m.content) 
          ? m.content.map(c => c.type === 'image' ? 'IMAGE' : c)
          : m.content
      })));
      
      const response = await client.beta.messages.create({
        max_tokens: maxTokens,
        messages: messages as any,
        model,
        system: [system],
        tools: toolParams,
        betas,
        ...extraBody,
      });

      console.log('=== AI RESPONSE ===');
      console.log('Stop reason:', response.stop_reason);
      const responseParams = responseToParams(response as unknown as BetaMessage);
      
      // Log the AI's response without the full base64 data
      const loggableContent = responseParams.map(block => {
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use',
            name: block.name,
            input: block.input
          };
        }
        return block;
      });
      console.log('AI response content:', loggableContent);
      
      // Always add the assistant's response to messages
      messages.push({
        role: 'assistant',
        content: responseParams,
      });

      // Check if the AI has completed its task
      if (response.stop_reason === 'end_turn') {
        console.log('AI has completed its task, ending loop');
        return messages;
      }

      const toolResultContent: BetaToolResultBlockParam[] = [];
      let hasToolUse = false;
      
      for (const contentBlock of responseParams) {
        if (contentBlock.type === 'tool_use' && contentBlock.name && contentBlock.input) {
          console.log('=== TOOL USE ATTEMPT ===');
          console.log('Tool:', contentBlock.name);
          console.log('Action:', contentBlock.input.action);
          
          hasToolUse = true;
          const toolInput = {
            action: contentBlock.input.action as Action,
            ...contentBlock.input
          };
          
          try {
            // Execute tool without logging the full result
            const result = await toolCollection.run(
              contentBlock.name,
              toolInput
            );
            
            // Just log the result type and size
            console.log('Tool execution completed');
            if (result.base64Image) {
              console.log('Result contains image of size:', result.base64Image.length);
            }
            if (result.output) {
              console.log('Result contains output:', result.output);
            }
            if (result.error) {
              console.log('Result contains error:', result.error);
            }
            
            // Create and add tool result without logging it
            const toolResult = makeApiToolResult(result, contentBlock.id!);
            toolResultContent.push(toolResult);
            
            // Call output callback without logging
            toolOutputCallback(result, contentBlock.id!);
            
            console.log('Tool result added to messages');
          } catch (error: unknown) {
            console.error('=== TOOL EXECUTION ERROR ===');
            console.error('Error executing tool:', contentBlock.name);
            if (error instanceof Error) {
              console.error('Error message:', error.message);
            }
            throw error;
          }
        }
      }

      // Only end the loop if there are no tool results AND no tool use was attempted
      if (toolResultContent.length === 0 && !hasToolUse && response.stop_reason !== 'tool_use') {
        console.log('No tool use or results, and not waiting for tool use, ending loop');
        return messages;
      }

      if (toolResultContent.length > 0) {
        console.log('Adding tool results to messages');
        messages.push({
          role: 'user',
          content: toolResultContent,
        });
        console.log('Tool results added, message count:', messages.length);
      }
      
      console.log('=== LOOP CONTINUING ===');
      console.log('Next API call will have', messages.length, 'messages');
    } catch (error: any) {
      console.error('=== ERROR IN LOOP ===');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      apiResponseCallback(error.request, error.response || error.body, error);
      return messages;
    }
  }
}

function maybeFilterToNMostRecentImages(
  messages: BetaMessageParam[],
  imagesToKeep: number,
  minRemovalThreshold: number
): void {
  if (imagesToKeep === undefined) return;

  const toolResultBlocks = messages
    .flatMap(message => {
      if (!message || !Array.isArray(message.content)) return [];
      return message.content.filter(item => 
        typeof item === 'object' && item.type === 'tool_result'
      );
    }) as BetaToolResultBlockParam[];

  let totalImages = 0;
  for (const toolResult of toolResultBlocks) {
    if (Array.isArray(toolResult.content)) {
      totalImages += toolResult.content.filter(
        content => typeof content === 'object' && content.type === 'image'
      ).length;
    }
  }

  let imagesToRemove = totalImages - imagesToKeep;
  imagesToRemove -= imagesToRemove % minRemovalThreshold;

  for (const toolResult of toolResultBlocks) {
    if (Array.isArray(toolResult.content)) {
      const newContent = [];
      for (const content of toolResult.content) {
        if (typeof content === 'object' && content.type === 'image') {
          if (imagesToRemove > 0) {
            imagesToRemove--;
            continue;
          }
        }
        newContent.push(content);
      }
      toolResult.content = newContent;
    }
  }
}

function responseToParams(response: BetaMessage): BetaContentBlockParam[] {
  const res: BetaContentBlockParam[] = [];
  
  for (const block of response.content) {
    if (block.type === 'text' && block.text) {
      res.push({ type: 'text', text: block.text });
    } else if (block.type === 'thinking') {
      const thinkingBlock: any = {
        type: 'thinking',
        thinking: block.thinking,
      };
      if (block.signature) {
        thinkingBlock.signature = block.signature;
      }
      res.push(thinkingBlock);
    } else {
      res.push(block as BetaContentBlockParam);
    }
  }
  
  return res;
}

function injectPromptCaching(messages: BetaMessageParam[]): void {
  let breakpointsRemaining = 3;
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    if (message.role === 'user' && Array.isArray(message.content)) {
      if (breakpointsRemaining > 0) {
        breakpointsRemaining--;
        const lastContent = message.content[message.content.length - 1];
        if (lastContent) {
          (lastContent as any).cache_control = { type: 'ephemeral' };
        }
      } else {
        const lastContent = message.content[message.content.length - 1];
        if (lastContent) {
          delete (lastContent as any).cache_control;
        }
        break;
      }
    }
  }
}

function makeApiToolResult(
  result: ToolResult,
  toolUseId: string
): BetaToolResultBlockParam {
  console.log('=== MAKING API TOOL RESULT ===');
  console.log('Tool use ID:', toolUseId);
  console.log('Result type:', result.error ? 'error' : 'success');
  
  const toolResultContent: (BetaTextBlockParam | BetaImageBlockParam)[] = [];
  let isError = false;

  if (result.error) {
    console.log('Processing error result');
    isError = true;
    toolResultContent.push({
      type: 'text',
      text: maybePrependSystemToolResult(result, result.error),
    });
  } else {
    console.log('Processing success result');
    if (result.output) {
      console.log('Adding output text');
      toolResultContent.push({
        type: 'text',
        text: maybePrependSystemToolResult(result, result.output),
      });
    }
    if (result.base64Image) {
      console.log('Adding base64 image');
      toolResultContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: result.base64Image,
        },
      });
    }
  }

  console.log('Final tool result content types:', toolResultContent.map(c => c.type));
  const finalResult: BetaToolResultBlockParam = {
    type: 'tool_result' as const,
    content: toolResultContent,
    tool_use_id: toolUseId,
    is_error: isError,
  };
  console.log('=== API TOOL RESULT COMPLETE ===');
  return finalResult;
}

function maybePrependSystemToolResult(result: ToolResult, resultText: string): string {
  if (result.system) {
    return `<system>${result.system}</system>\n${resultText}`;
  }
  return resultText;
}
