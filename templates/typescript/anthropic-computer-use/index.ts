import { Kernel, type KernelContext } from '@onkernel/sdk';
import { chromium } from 'playwright';
import { z } from 'zod';
import { ComputerUseAgent } from '@onkernel/cu-playwright';

const kernel = new Kernel();

const app = kernel.app('ts-anthropic-cu');

const HackerNewsStorySchema = z.object({
  title: z.string(),
  points: z.number(),
  author: z.string(),
  comments: z.number(),
  url: z.string().optional(),
});

type HackerNewsStory = z.infer<typeof HackerNewsStorySchema>;

interface GetStoriesInput {
  count?: number;
}

interface GetStoriesOutput {
  stories: HackerNewsStory[];
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set');
}

app.action<GetStoriesInput, GetStoriesOutput>(
  'anthropic-computer-use-task',
  async (ctx: KernelContext, payload?: GetStoriesInput): Promise<GetStoriesOutput> => {
    const count = payload?.count || 5;

    const kernelBrowser = await kernel.browsers.create({
      invocation_id: ctx.invocation_id,
      stealth: true,
    });
    
    console.log("Kernel browser live view url: ", kernelBrowser.browser_live_view_url);

    const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
    
    try {
      const context = browser.contexts()[0];
      if (!context) {
        throw new Error("No browser context found.");
      }
      const page = context.pages()[0];
      if (!page) {
        throw new Error("No page found in browser context.");
      }

      const agent = new ComputerUseAgent({
          apiKey: ANTHROPIC_API_KEY,
          page,
      });
      
      const stories = await agent.execute(
          `Get the top ${count} Hacker News stories with their details`,
          z.array(HackerNewsStorySchema).max(count)
      );

      return { stories };
    } finally {
        await browser.close();
    }
  },
); 