import { Kernel, type KernelContext } from '@onkernel/sdk';
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from 'zod';

const kernel = new Kernel();

const app = kernel.app('ts-stagehand');

interface SearchQueryInput {
  query: string;
}

interface SearchQueryOutput {
  url: string;
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
    
    console.log("Kernel browser live view url: ", kernelBrowser.browser_live_view_url);

    const stagehand = new Stagehand({
      env: "LOCAL",
      verbose: 1,
      domSettleTimeoutMs: 30_000,
      modelName: "openai/gpt-4o",
      modelClientOptions: {
        apiKey: process.env.OPENAI_API_KEY,
      },
      localBrowserLaunchOptions: {
        cdpUrl: kernelBrowser.cdp_ws_url,
      }
    });
    await stagehand.init();
    const page = stagehand.page;
    await page.act(`Type in ${payload.query} into the search bar`);
    await page.act("Click the search button");
    const output = await page.extract({
      instruction: "Extract the url of the first search result",
      schema: z.object({ url: z.string() })
    });

    await stagehand.close();
    
    return output;
  },
);
