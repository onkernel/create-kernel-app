import { Kernel, type KernelContext } from "@onkernel/sdk";
import { chromium } from "playwright";

const kernel = new Kernel();

const app = kernel.app("ts-advanced");

/**
 * Instantiates a persisted Kernel browser that can be reused across invocations
 * Use this to test Kernel browsers manually with our browser live view
 * https://docs.onkernel.com/launch/browser-persistence
 */
app.action("create-persisted-browser",
  async (ctx: KernelContext): Promise<{ browser_live_view_url: string }> => {

    const kernelBrowser = await kernel.browsers.create({
      invocation_id: ctx.invocation_id,
      persistence: {
        id: "persisted-browser",
      },
      stealth: true, // Turns on residential proxy & auto-CAPTCHA solver
    });

    return {
      browser_live_view_url: kernelBrowser.browser_live_view_url,
    };
  }
);

/**
 * Example showing Kernel's auto-CAPTCHA solver
 * Visit the live view url to see the Kernel browser auto-solve the CAPTCHA on the site
 */
app.action("test-captcha-solver", async(ctx: KernelContext): Promise<void> => {

  const kernelBrowser = await kernel.browsers.create({
    invocation_id: ctx.invocation_id,
    stealth: true,
  });
  const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);

  // Access the live view. Retrieve this live_view_url from the Kernel logs in your CLI:
  // export KERNEL_API_KEY=<Your API key>
  // kernel logs ts-advanced --follow
  console.log("Kernel browser live view url: ", kernelBrowser.browser_live_view_url);

  // Navigate to a site with a CAPTCHA
  const context = await browser.contexts()[0] || (await browser.newContext());
  const page = await context.pages()[0] || (await context.newPage());
  await page.waitForTimeout(10000); // Add a delay to give you time to visit the live view url
  await page.goto("https://www.google.com/recaptcha/api2/demo");


  // Watch Kernel auto-solve the CAPTCHA!
});

