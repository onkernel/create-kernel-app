// @ts-nocheck

import { chromium, type Browser, type Page } from "playwright";
import { BasePlaywrightComputer } from "./base";

/**
 * Launches a local Chromium instance using Playwright.
 */
export class LocalPlaywrightComputer extends BasePlaywrightComputer {
	private headless: boolean;

	constructor(headless: boolean = false) {
		super();
		this.headless = headless;
	}

	async _getBrowserAndPage(): Promise<[Browser, Page]> {
		const [width, height] = this.getDimensions();
		const launchArgs = [
			`--window-size=${width},${height}`,
			"--disable-extensions",
			"--disable-file-system",
		];

		const browser = await chromium.launch({
			headless: this.headless,
			args: launchArgs,
			env: { DISPLAY: ":0" },
		});

		const context = await browser.newContext();

		// Add event listeners for page creation and closure
		context.on("page", this._handleNewPage.bind(this));

		const page = await context.newPage();
		await page.setViewportSize({ width, height });
		page.on("close", this._handlePageClose.bind(this));

		await page.goto("https://bing.com");

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
		if (this._page === page) {
			// Check if browser and contexts exist before accessing
			if (
				this._browser &&
				this._browser.contexts &&
				this._browser.contexts.length > 0
			) {
				const context = this._browser.contexts[0];
				if (context.pages && context.pages.length > 0) {
					this._page = context.pages[context.pages.length - 1];
				} else {
					console.log("Warning: All pages have been closed.");
					this._page = null;
				}
			} else {
				console.log("Warning: Browser or context not available.");
				this._page = null;
			}
		}
	}
}
