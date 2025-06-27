import 'dotenv/config';
import { Kernel, type KernelContext } from '@onkernel/sdk';
import { chromium } from 'playwright';
import { ComputerUseAgent } from '@onkernel/cu-playwright';

const kernel = new Kernel();

const app = kernel.app('ts-anthropic-cu');

interface QueryInput {
  query: string;
}

interface QueryOutput {
  result: string;
}

app.action<QueryInput, QueryOutput>(
  'computer-use-query',
  async (ctx: KernelContext, payload?: QueryInput): Promise<QueryOutput> => {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }

    if (!payload?.query) {
      throw new Error('Query is required');
    }

    const kernelBrowser = await kernel.browsers.create({
      invocation_id: ctx.invocation_id,
    });

    const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);

    try {
      const context = browser.contexts()[0];
      if (!context) {
        throw new Error('No browser context found.');
      }
      const page = context.pages()[0];
      if (!page) {
        throw new Error('No page found in browser context.');
      }

      const agent = new ComputerUseAgent({
        apiKey: ANTHROPIC_API_KEY,
        page,
      });

      const result = await agent.execute(payload.query);

      return { result };
    } finally {
      await browser.close();
    }
  }
);
