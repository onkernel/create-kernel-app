// @ts-nocheck

import utils from "../utils.ts";
import sharp from "sharp";
import type { Browser, Page, Route, Request } from "playwright";

// Optional: key mapping if your model uses "CUA" style keys
const CUA_KEY_TO_PLAYWRIGHT_KEY: Record<string, string> = {
	"/": "/",
	"\\": "\\",
	alt: "Alt",
	arrowdown: "ArrowDown",
	arrowleft: "ArrowLeft",
	arrowright: "ArrowRight",
	arrowup: "ArrowUp",
	backspace: "Backspace",
	capslock: "CapsLock",
	cmd: "Meta",
	ctrl: "Control",
	delete: "Delete",
	end: "End",
	enter: "Enter",
	esc: "Escape",
	home: "Home",
	insert: "Insert",
	option: "Alt",
	pagedown: "PageDown",
	pageup: "PageUp",
	shift: "Shift",
	space: " ",
	super: "Meta",
	tab: "Tab",
	win: "Meta",
};

interface Point {
	x: number;
	y: number;
}

/**
 * Abstract base for Playwright-based computers:
 *
 * - Subclasses override `_getBrowserAndPage()` to do local or remote connection,
 *   returning [Browser, Page].
 * - This base class handles context creation (`enter()`/`exit()`),
 *   plus standard "Computer" actions like click, scroll, etc.
 * - We also have extra browser actions: `goto(url)` and `back()`.
 */
export class BasePlaywrightComputer {
	protected _browser: Browser | null = null;
	protected _page: Page | null = null;

	constructor() {
		this._browser = null;
		this._page = null;
	}

	getEnvironment(): string {
		return "browser";
	}

	getDimensions(): [number, number] {
		return [1024, 768];
	}

	async enter(): Promise<this> {
		// Call the subclass hook for getting browser/page
		[this._browser, this._page] = await this._getBrowserAndPage();

		// Set up network interception to flag URLs matching domains in BLOCKED_DOMAINS
		const handleRoute = (route: Route, request: Request): void => {
			const url = request.url();
			if (utils.checkBlocklistedUrl(url)) {
				console.log(`Flagging blocked domain: ${url}`);
				route.abort();
			} else {
				route.continue();
			}
		};

		await this._page!.route("**/*", handleRoute);
		return this;
	}

	async exit(): Promise<void> {
		if (this._browser) {
			await this._browser.close();
		}
	}

	getCurrentUrl(): string {
		return this._page!.url();
	}

	// Common "Computer" actions
	async screenshot(): Promise<string> {
		// Capture only the viewport (not full_page)
		const screenshotBuffer = await this._page!.screenshot({ fullPage: false });
		const webpBuffer = await sharp(screenshotBuffer).webp().toBuffer();
		return webpBuffer.toString("base64");
	}

	async click(button: string = "left", x: number, y: number): Promise<void> {
		// console.dir({ debug:{base:{click:{x,y,button}}} },{depth:null})
		switch (button) {
			case "back":
				await this.back();
				break;
			case "forward":
				await this.forward();
				break;
			case "wheel":
				await this._page!.mouse.wheel(x, y);
				break;
			default:
				const buttonMapping: Record<string, "left" | "right"> = {
					left: "left",
					right: "right",
				};
				const buttonType =
					buttonMapping[button as keyof typeof buttonMapping] || "left";
				await this._page!.mouse.click(x, y, { button: buttonType });
		}
	}

	async doubleClick(x: number, y: number): Promise<void> {
		await this._page!.mouse.dblclick(x, y);
	}

	async scroll(
		x: number,
		y: number,
		scrollX: number,
		scrollY: number,
	): Promise<void> {
		await this._page!.mouse.move(x, y);
		await this._page!.evaluate(`window.scrollBy(${scrollX}, ${scrollY})`);
	}

	async type(text: string): Promise<void> {
		await this._page!.keyboard.type(text);
	}

	async keypress(keys: string[]): Promise<void> {
		const mappedKeys = keys.map(
			(key) => CUA_KEY_TO_PLAYWRIGHT_KEY[key.toLowerCase()] || key,
		);
		for (const key of mappedKeys) {
			await this._page!.keyboard.down(key);
		}
		for (const key of mappedKeys.reverse()) {
			await this._page!.keyboard.up(key);
		}
	}

	async wait(ms: number = 1000): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	async move(x: number, y: number): Promise<void> {
		await this._page!.mouse.move(x, y);
	}

	async drag(path: Point[]): Promise<void> {
		if (!path.length) {
			return;
		}
		await this._page!.mouse.move(path[0].x, path[0].y);
		await this._page!.mouse.down();
		for (const point of path.slice(1)) {
			await this._page!.mouse.move(point.x, point.y);
		}
		await this._page!.mouse.up();
	}

	// Extra browser-oriented actions
	async goto(url: string): Promise<any> {
		try {
			return await this._page!.goto(url);
		} catch (e) {
			console.log(`Error navigating to ${url}: ${e}`);
		}
	}

	async back(): Promise<any> {
		return await this._page!.goBack();
	}

	async forward(): Promise<any> {
		return await this._page!.goForward();
	}

	// Subclass hook
	async _getBrowserAndPage(): Promise<[Browser, Page]> {
		// Subclasses must implement, returning [Browser, Page]
		throw new Error("Subclasses must implement _getBrowserAndPage()");
	}
}
