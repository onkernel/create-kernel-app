import { Kernel, type KernelContext } from "@onkernel/sdk";
import { chromium } from "playwright";

const kernel = new Kernel();

const app = kernel.app("ts-advanced");

/**
 * Example showing Kernel's auto-CAPTCHA solver
 * Visit the live view url to see the Kernel browser auto-solve the CAPTCHA on the site
 *
 * Args:
 *     ctx: Kernel context containing invocation information
 * Returns:
 *     None
 *
 * Invoke this via CLI:
 *  kernel login
 *  kernel deploy index.ts # If you haven't already deployed this app
 *  kernel invoke ts-advanced test-captcha-solver
 *  kernel logs ts-advanced -f # Open in separate tab
 */
app.action("test-captcha-solver", async (ctx: KernelContext): Promise<void> => {
  const kernelBrowser = await kernel.browsers.create({
    invocation_id: ctx.invocation_id,
    stealth: true,
    persistence: {
      id: "captcha-solver",
    },
  });
  const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);

  // Access the live view. Retrieve this live_view_url from the Kernel logs in your CLI:
  // kernel login
  // kernel logs ts-advanced --follow
  console.log(
    "Kernel browser live view url: ",
    kernelBrowser.browser_live_view_url
  );

  // Navigate to a site with a CAPTCHA
  const context = (await browser.contexts()[0]) || (await browser.newContext());
  const page = (await context.pages()[0]) || (await context.newPage());
  await page.waitForTimeout(10000); // Add a delay to give you time to visit the live view url
  await page.goto("https://www.google.com/recaptcha/api2/demo");
  // Watch Kernel auto-solve the CAPTCHA!
  await browser.close();
});
