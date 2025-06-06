import { Kernel, type KernelContext } from "@onkernel/sdk";
import { chromium, type BrowserContext, type Page } from "playwright";

const kernel = new Kernel();

const app = kernel.app("ts-persistent-browser");

interface PageTitleInput {
  url: string;
}

interface PageTitleOutput {
  title: string;
  elapsed_ms: number;
}

app.action<PageTitleInput, PageTitleOutput>(
  "get-page-title",
  async (
    ctx: KernelContext,
    payload?: PageTitleInput
  ): Promise<PageTitleOutput> => {
    // A function that extracts the title of a webpage

    // Args:
    //     ctx: Kernel context containing invocation information
    //     payload: An object with a URL property

    // Returns:
    //     A dictionary containing the page title
    if (!payload?.url) {
      throw new Error("URL is required");
    }

    if (
      !payload.url.startsWith("http://") &&
      !payload.url.startsWith("https://")
    ) {
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
      persistence: {
        id: "ts-persistent-browser",
      },
      stealth: true,
    });

    console.log(
      "Kernel browser live view url: ",
      kernelBrowser.browser_live_view_url
    );

    const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
    try {
      const now = Date.now();
      const contexts = await browser.contexts();
      let context: BrowserContext = contexts[0] ?? (await browser.newContext());
      let page: Page = context.pages()[0] ?? (await context.newPage());
      if (page.url() !== payload.url) {
        console.log("navigating to", payload.url);
        await page.goto(payload.url);
      } else {
        console.log("page already loaded, skipping navigation");
        await page.bringToFront();
      }
      const title = await page.title();
      return { title, elapsed_ms: Date.now() - now };
    } finally {
      await browser.close();
    }
  }
);
