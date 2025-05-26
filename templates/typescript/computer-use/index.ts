import { Kernel, type KernelContext } from '@onkernel/sdk';
import { samplingLoop } from './loop';
import type { ToolResult } from './tools/computer';
import { chromium } from 'playwright';

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
  console.log('Tool output:', { id, result: Object.keys(result) });
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

    const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
    const context = await browser.contexts()[0];
    const page = await context?.pages()[0];
    if (!page) {
      throw new Error('Error getting initial page');
    }

    // Run the sampling loop
    const finalMessages = await samplingLoop({
      model: 'claude-sonnet-4-20250514',
      messages: [{
        role: 'user',
        content: payload.query
      }],
      outputCallback: cuOutputCallback,
      toolOutputCallback: cuToolOutputCallback,
      apiResponseCallback: cuApiResponseCallback,
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      playwrightPage: page,
    });

    await browser.close();

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
