import { chromium, type Browser, type Page } from "playwright";
import { BasePlaywrightComputer } from "./base";

/**
 * KernelPlaywrightComputer connects to a remote browser instance via CDP WebSocket URL.
 * Similar to LocalPlaywrightComputer but uses an existing browser instance instead of launching one.
 */
export class KernelPlaywrightComputer extends BasePlaywrightComputer {
	private cdp_ws_url: string;

	constructor(cdp_ws_url: string) {
		super();
		this.cdp_ws_url = cdp_ws_url;
	}

	async _getBrowserAndPage(): Promise<[Browser, Page]> {
		const [width, height] = this.getDimensions();

		// Connect to existing browser instance via CDP
		const browser = await chromium.connectOverCDP(this.cdp_ws_url);

		// Get existing context or create new one
		let context = browser.contexts()[0];
		if (!context) {
			context = await browser.newContext();
		}

		// Add event listeners for page creation and closure
		context.on("page", this._handleNewPage.bind(this));

		// Get existing page or create new one
		let page = context.pages()[0];
		if (!page) {
			page = await context.newPage();
		}

		// Set viewport size
		await page.setViewportSize({ width, height });
		page.on("close", this._handlePageClose.bind(this));

		return [browser, page];
	}

	private _handleNewPage(page: Page): void {
		/** Handle the creation of a new page. */
		console.log("New page created");
		this._page = page;
		page.on("close", this._handlePageClose.bind(this));
	}

	private _handlePageClose(page: Page): void {
		/** Handle the closure of a page. */
		console.log("Page closed");
		try {
			this._assertPage();
		} catch {
			return;
		}
		if (this._page !== page) return;

		const browser = this._browser;
		if (!browser || typeof browser.contexts !== "function") {
			console.log("Warning: Browser or context not available.");
			this._page = undefined as any;
			return;
		}

		const contexts = browser.contexts();
		if (!contexts.length) {
			console.log("Warning: No browser contexts available.");
			this._page = undefined as any;
			return;
		}

		const context = contexts[0];
		if (!context || typeof context.pages !== "function") {
			console.log("Warning: Context pages not available.");
			this._page = undefined as any;
			return;
		}

		const pages = context.pages();
		if (pages.length) {
			this._page = pages[pages.length - 1]!;
		} else {
			console.log("Warning: All pages have been closed.");
			this._page = undefined as any;
		}
	}
}
