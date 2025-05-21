import { Kernel, type KernelContext } from '@onkernel/sdk';
import { chromium } from 'playwright';

const kernel = new Kernel();

const app = kernel.app('ts-basic');

interface PageTitleInput {
  url: string;
}

interface PageTitleOutput {
  title: string;
}

app.action<PageTitleInput, PageTitleOutput>(
  'get-page-title',
  async (ctx: KernelContext, payload?: PageTitleInput): Promise<PageTitleOutput> => {
    // A function that extracts the title of a webpage
    
    // Args:
    //     ctx: Kernel context containing invocation information
    //     payload: An object with a URL property
        
    // Returns:
    //     A dictionary containing the page title
    if (!payload?.url) {
      throw new Error('URL is required');
    }
    
    if (!payload.url.startsWith('http://') && !payload.url.startsWith('https://')) {
      payload.url = `https://${payload.url}`;
    }

    // Validate the URL
    try {
      new URL(payload.url);
    } catch {
      throw new Error(`Invalid URL: ${payload.url}`);
    }

    const kernelBrowser = await kernel.browsers.create({
      invocation_id: ctx.invocation_id,
    });

    console.log("Kernel browser live view url: ", kernelBrowser.browser_live_view_url);

    const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(payload.url);
      const title = await page.title();
      return { title };
    } finally {
      await browser.close();
    }
  },
);
