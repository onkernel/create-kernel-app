import { Kernel, type KernelContext } from '@onkernel/sdk';
import { samplingLoop, APIProvider, ToolVersion } from './loop';
import type { BetaMessageParam } from './loop';
import type { ToolResult } from './tools/computer';

const kernel = new Kernel();

const app = kernel.app('ts-cu');

interface QueryInput {
  query: string;
}

interface QueryOutput {
  result: string;
}

// Anthropic callbacks for handling loop output
const cuOutputCallback = (block: any) => {
  console.log('Output block:', block);
};

const cuToolOutputCallback = (result: ToolResult, id: string) => {
  console.log('Tool output:', { id, result });
};

const cuApiResponseCallback = (request: any, response: any, error: any) => {
  if (error) {
    console.error('API error:', error);
  } else {
    console.log('API response:', { request, response });
  }
};

app.action<QueryInput, QueryOutput>(
  'cu-task',
  async (ctx: KernelContext, payload?: QueryInput): Promise<QueryOutput> => {
    if (!payload?.query) {
      throw new Error('Query is required');
    }

    const kernelBrowser = await kernel.browsers.create({
      invocation_id: ctx.invocation_id,
    });

    console.log("Kernel browser live view url: ", kernelBrowser.browser_live_view_url);

    // Initialize messages with the user's query
    const messages: BetaMessageParam[] = [{
      role: 'user',
      content: payload.query
    }];

    // Run the sampling loop
    const finalMessages = await samplingLoop({
      model: 'claude-3-opus-20240229',
      provider: APIProvider.ANTHROPIC,
      messages,
      outputCallback: cuOutputCallback,
      toolOutputCallback: cuToolOutputCallback,
      apiResponseCallback: cuApiResponseCallback,
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      toolVersion: ToolVersion.V20250124,
    });

    // Extract the final result from the messages
    if (finalMessages.length === 0) {
      throw new Error('No messages were generated during the sampling loop');
    }

    const lastMessage = finalMessages[finalMessages.length - 1];
    if (!lastMessage) {
      throw new Error('Failed to get the last message from the sampling loop');
    }

    const result = typeof lastMessage.content === 'string' 
      ? lastMessage.content 
      : lastMessage.content.map(block => 
          block.type === 'text' ? block.text : ''
        ).join('');

    return { result };
  },
);
