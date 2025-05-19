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
  async (ctx: KernelContext, input: PageTitleInput): Promise<PageTitleOutput> => {
    // A function that extracts the title of a webpage
    
    // Args:
    //     ctx: Kernel context containing invocation information
    //     input_data: An object with a URL property
        
    // Returns:
    //     A dictionary containing the page title
    if (!input.url) {
      throw new Error('URL is required');
    }

    const kernelBrowser = await kernel.browsers.create({
      invocation_id: ctx.invocation_id,
    });

    const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(input.url);
      const title = await page.title();
      return { title };
    } finally {
      await browser.close();
    }
  },
);
