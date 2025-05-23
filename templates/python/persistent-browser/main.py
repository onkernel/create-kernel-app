import kernel
from kernel import Kernel
from playwright.async_api import async_playwright
from typing import TypedDict
from urllib.parse import urlparse
from datetime import datetime

client = Kernel()

# Create a new Kernel app
app = kernel.App("python-persistent-browser")

class PageTitleInput(TypedDict):
    url: str

class PageTitleOutput(TypedDict):
    title: str
    elapsed_ms: float

@app.action("get-page-title")
async def get_page_title(ctx: kernel.KernelContext, input_data: PageTitleInput) -> PageTitleOutput:
    """
    A function that extracts the title of a webpage
    
    Args:
        ctx: Kernel context containing invocation information
        input_data: An object with a URL property
        
    Returns:
        A dictionary containing the page title
    """
    url = input_data.get("url")
    if not url or not isinstance(url, str):
        raise ValueError("URL is required and must be a string")

    # Add https:// if no protocol is present
    if not url.startswith(('http://', 'https://')):
        url = f"https://{url}"

    # Validate the URL
    try:
        urlparse(url)
    except Exception:
        raise ValueError(f"Invalid URL: {url}")

    # Create a browser instance using the context's invocation_id and a persistent id
    kernel_browser = client.browsers.create(
        invocation_id=ctx.invocation_id, 
        persistence={"id": "my-awesome-persistent-browser-2"}
    )
    print("Kernel browser live view url: ", kernel_browser.browser_live_view_url)
    
    async with async_playwright() as playwright:
        browser = await playwright.chromium.connect_over_cdp(kernel_browser.cdp_ws_url)
        try:
            now = datetime.now()
            context = len(browser.contexts) > 0 and browser.contexts[0] or await browser.new_context()
            page = len(context.pages) > 0 and context.pages[0] or await context.new_page()
            current_url = page.url
            print("Current url: ", current_url)
            if current_url != url:
                print("Not at url, navigating to it")
                await page.goto(url)
            else:
                print("Already at url, skipping navigation")
                # for some reason going straight to page.title() leads to an error: Page.title: Execution context was destroyed, most likely because of a navigation
                # calling bring_to_front() seems to fix it :shrug:
                await page.bring_to_front() 
            title = await page.title()
            elapsedMilliseconds = (datetime.now() - now).total_seconds() * 1000
            return {"title": title, "elapsed_ms": elapsedMilliseconds}
        finally:
            await browser.close()
