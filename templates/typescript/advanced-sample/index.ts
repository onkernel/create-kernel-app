import { Kernel, type KernelContext } from "@onkernel/sdk";
import { chromium } from "playwright";
import { computerUseLoop } from './cu/loop';

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
 *  export KERNEL_API_KEY=<your_api_key>
 *  kernel deploy index.ts # If you haven't already deployed this app
 *  kernel invoke ts-advanced test-captcha-solver
 *  kernel logs ts-advanced -f # Open in separate tab
 */
app.action("test-captcha-solver", async(ctx: KernelContext): Promise<void> => {

  const kernelBrowser = await kernel.browsers.create({
    invocation_id: ctx.invocation_id,
    stealth: true,
    persistence: {
      id: "captcha-solver",
    },
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
  await browser.close();
});

/** Human in the loop example
 * We'll automate a grocery shopping task using Playwright,
 * then pass the browser to the user to complete the checkout.
 * 
 * 1. Navigate to a grocery store website
 * 2. Auto-fill a shopping cart
 * 3. Provide the live view url to the user to complete the checkout
 * 
 * Args:
 *     ctx: Kernel context containing invocation information
 * Returns:
 *     A dictionary containing the browser live view url
 * 
 * Invoke this via CLI:
 *  export KERNEL_API_KEY=<your_api_key>
 *  kernel deploy index.ts # If you haven't already deployed this app
 *  kernel invoke ts-advanced human-in-the-loop-sample
 *  kernel logs ts-advanced -f # Open in separate tab
 */
app.action("human-in-the-loop-sample", async (ctx: KernelContext): Promise<{ browser_live_view_url: string }> => {
  const kernelBrowser = await kernel.browsers.create({
    invocation_id: ctx.invocation_id,
    persistence: {
      id: "hitl-browser",
    },
  });
  const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
  const context = await browser.contexts()[0] || (await browser.newContext());
  const page = await context.pages()[0] || (await context.newPage());

  // Navigate to the grocery store website
  await page.goto("https://www.goodeggs.com/search?q=salmon");
  await page.waitForTimeout(5000);
  // Click on the first product available
  await page.click('.product-tile:first-child');
  await page.waitForTimeout(3000);
  // Add salmon to the cart
  // Select two to meet the minimum order requirement
  await page.selectOption('select[data-testid="choice-select__select"]', '2');
  await page.waitForTimeout(3000);
  await page.click('button.btn.primary.save');
  await page.waitForTimeout(5000);
  // Go to the car
  await page.goto("https://www.goodeggs.com/basket");
  // Return the live view url so it can be presented to the user to complete the checkot
  return {
    browser_live_view_url: kernelBrowser.browser_live_view_url,
  }
});

/** Auth example
 * Implements Anthropic Computer Use to to perform a task on behalf of the user 
 * with their credentials. This example automatically logs in with the provided credentials.
 * We'll also use a persisted browser: the second time you run this action, the previous
 * browser will restored and the user will already be logged in.
 * 
 * Args:
 *     ctx: Kernel context containing invocation information
 *     payload: An object with a query, website, and auth object
 * Returns:
 *     A dictionary containing the result of the task
 * 
 * Invoke this via CLI:
 *  export KERNEL_API_KEY=<your_api_key>
 *  kernel deploy index.ts -e ANTHROPIC_API_KEY=<your_anthropic_api_key> # If you haven't already deployed this app
 *  kernel invoke ts-advanced auth-sample -p '{"query": 
 *    "If I have an upcoming delivery, return the delivery date.
 *    If not, return No upcoming deliveries.",
 *    "website": "goodeggs.com",
 *    "auth": {"username": "your_username", "password": "your_password"}}'
 *  kernel logs ts-advanced -f # Open in separate tab
 */
interface AuthSampleInput {
  query: string;
  website: string;
  auth: {
    username: string;
    password: string;
  };
}

app.action("auth-sample", async (ctx: KernelContext, payload?: AuthSampleInput): Promise<{ result: string }> => {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');

  if (!payload) throw new Error('Payload is required');
  const { query, auth, website } = payload;
  if (!query || !auth || !website) throw new Error('Query, auth, and website are required');

  const kernelBrowser = await kernel.browsers.create({
    invocation_id: ctx.invocation_id,
    persistence: {
      id: "auth-browser",
    },
    stealth: true,
  });
  console.log("Kernel browser live view url: ", kernelBrowser.browser_live_view_url);

  const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
  const context = await browser.contexts()[0];
  const page = await context?.pages()[0];
  if (!page) {
    throw new Error('Error getting initial page');
  }

  // Create full prompt for LLM to execute
  const prompt = `Go to ${website} and ${query}. If you are not logged in, use the following credentials:
    <Sensitive>
      Username: ${auth.username}
      Password: ${auth.password}
    </Sensitive>
  `;

  try {
    // Run the Computer Use sampling loop
    const finalMessages = await computerUseLoop({
      model: 'claude-sonnet-4-20250514',
      messages: [{
        role: 'user',
        content: prompt,
      }],
      apiKey: ANTHROPIC_API_KEY,
      thinkingBudget: 1024,
      playwrightPage: page,
    });

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
  } catch (error) {
    console.error('Error in sampling loop:', error);
    throw error;
  } finally {
    await browser.close();
  }
});