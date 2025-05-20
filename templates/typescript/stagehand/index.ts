import { Kernel, type KernelContext } from '@onkernel/sdk';
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from 'zod';

const kernel = new Kernel();

const app = kernel.app('ts-stagehand');

interface SearchQueryInput {
  query: string;
}

interface SearchQueryOutput {
  output: string;
}

app.action<SearchQueryInput, SearchQueryOutput>(
  'stagehand-task',
  async (ctx: KernelContext, payload?: SearchQueryInput): Promise<SearchQueryOutput> => {
    // A function that returns the first search result of a given search query from Google
    
    // Args:
    //     ctx: Kernel context containing invocation information
    //     payload: A search query string
        
    // Returns:
    //     output: The URL of the first search result

    if (!payload?.query) {
      throw new Error('Query is required');
    }

    const kernelBrowser = await kernel.browsers.create({
      invocation_id: ctx.invocation_id,
    });

    const stagehand = new Stagehand({
      env: "LOCAL",
      modelName: "gpt-4o",
      modelClientOptions: {
        apiKey: process.env.OPENAI_API_KEY,
      },
      localBrowserLaunchOptions: {
        cdpUrl: kernelBrowser.cdp_ws_url,
      }
    });
    await stagehand.init();
    const page = stagehand.page;
    await page.goto("https://www.google.com");
    await page.act(`Type in ${payload.query} into the search bar`);

    const { output } = await page.extract({
      instruction: "The url of the first search result",
      schema: z.object({
        output: z.string(),
      }),
    });

    await stagehand.close();
    
    return { output };
  },
);
