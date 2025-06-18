// @ts-nocheck

import utils from "./utils";
import computers from "./computers";
import toolset from "./toolset";

import type { BasePlaywrightComputer } from "./playwright/base";

interface Tool {
	type: string;
	display_width?: number;
	display_height?: number;
	environment?: string;
	[key: string]: any;
}

interface SafetyCheck {
	message: string;
	[key: string]: any;
}

interface Item {
	type: string;
	content?: Array<{ type: string; text: string }>;
	name?: string;
	arguments?: string;
	call_id?: string;
	action?: {
		type: string;
		[key: string]: any;
	};
	pending_safety_checks?: SafetyCheck[];
	role?: string;
	[key: string]: any;
}

interface ComputerCallOutput {
	type: string;
	call_id: string;
	acknowledged_safety_checks: SafetyCheck[];
	output: {
		type: string;
		image_url: string;
		current_url?: string;
	};
}

type AcknowledgeSafetyCheckCallback = (message: string) => boolean;

/**
 * A sample agent class that can be used to interact with a computer.
 */
export class Agent {
	private model: string;
	private computer: BasePlaywrightComputer | null;
	private tools: Tool[];
	private print_steps: boolean;
	private debug: boolean;
	private show_images: boolean;
	private acknowledge_safety_check_callback: AcknowledgeSafetyCheckCallback;

	constructor(
		model: string = "computer-use-preview",
		computer: BasePlaywrightComputer | null = null,
		tools: Tool[],
		acknowledge_safety_check_callback: AcknowledgeSafetyCheckCallback = () =>
			true,
	) {
		this.model = model;
		this.computer = computer;
		this.tools = [...toolset.shared, ...tools];
		this.print_steps = true;
		this.debug = false;
		this.show_images = false;
		this.acknowledge_safety_check_callback = acknowledge_safety_check_callback;

		if (computer) {
			const dimensions = computer.getDimensions();
			this.tools.push({
				type: "computer-preview",
				display_width: dimensions[0],
				display_height: dimensions[1],
				environment: computer.getEnvironment(),
			});
		}
	}

	private debugPrint(...args: any[]): void {
		if (this.debug) {
			console.warn("--- debug:agent:debugPrint");
			console.dir(...args, { depth: null });
		}
	}

	private async handleItem(item: Item): Promise<Item[]> {
		/**Handle each item; may cause a computer action + screenshot.*/
		if (item.type === "message") {
			if (this.print_steps) {
				console.log(item.content![0].text);
			}
		}

		if (item.type === "function_call") {
			const name = item.name!;
			const args = JSON.parse(item.arguments!);
			if (this.print_steps) {
				console.log(`${name}(${JSON.stringify(args)})`);
			}

			if (this.computer && (this.computer as any)[name]) {
				const method = (this.computer as any)[name];
				await method.call(this.computer, ...Object.values(args));
			}
			return [
				{
					type: "function_call_output",
					call_id: item.call_id!,
					output: "success", // hard-coded output for demo
				},
			];
		}

		if (item.type === "computer_call") {
			const action = item.action!;
			const action_type = action.type;
			const action_args = Object.fromEntries(
				Object.entries(action).filter(([k]) => k !== "type"),
			);
			if (this.print_steps) {
				console.log(`${action_type}(${JSON.stringify(action_args)})`);
			}

			if (this.computer) {
				const method = (this.computer as any)[action_type];
				await method.call(this.computer, ...Object.values(action_args));

				const screenshot_base64 = await this.computer.screenshot();
				// console.dir({ debug: { screenshot_base64 }})

				// if user doesn't ack all safety checks exit with error
				const pending_checks = item.pending_safety_checks || [];
				for (const check of pending_checks) {
					const message = check.message;
					if (!this.acknowledge_safety_check_callback(message)) {
						throw new Error(
							`Safety check failed: ${message}. Cannot continue with unacknowledged safety checks.`,
						);
					}
				}

				const call_output: ComputerCallOutput = {
					type: "computer_call_output",
					call_id: item.call_id!,
					acknowledged_safety_checks: pending_checks,
					output: {
						type: "input_image",
						image_url: `data:image/webp;base64,${screenshot_base64}`,
					},
				};

				// additional URL safety checks for browser environments
				if (this.computer.getEnvironment() === "browser") {
					const current_url = this.computer.getCurrentUrl();
					utils.checkBlocklistedUrl(current_url);
					call_output.output.current_url = current_url;
				}

				return [call_output];
			}
		}
		return [];
	}

	async runFullTurn(
		input_items: Item[],
		print_steps: boolean = true,
		debug: boolean = false,
		show_images: boolean = false,
	): Promise<Item[]> {
		this.print_steps = print_steps;
		this.debug = debug;
		this.show_images = show_images;
		const new_items: Item[] = [];

		// keep looping until we get a final response
		while (
			new_items.length === 0 ||
			new_items[new_items.length - 1].role !== "assistant"
		) {
			this.debugPrint(
				input_items.concat(new_items).map((msg) => utils.sanitizeMessage(msg)),
			);

			const response = await utils.createResponse({
				model: this.model,
				input: input_items.concat(new_items),
				tools: this.tools,
				truncation: "auto",
			});
			this.debugPrint(response);

			if (!response.output && this.debug) {
				console.log(response);
				throw new Error("No output from model");
			} else {
				new_items.push(...response.output);
				for (const item of response.output) {
					const handled_items = await this.handleItem(item);
					new_items.push(...handled_items);
				}
			}
		}

		// Return sanitized messages if show_images is false
		if (!show_images) {
			return new_items.map((msg) => utils.sanitizeMessage(msg));
		}

		return new_items;
	}
}

export default { Agent };
