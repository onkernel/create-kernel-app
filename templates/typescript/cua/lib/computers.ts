import { KernelPlaywrightComputer } from "./playwright/kernel.ts";
import { LocalPlaywrightComputer } from "./playwright/local.ts";

interface ComputerConfig {
	type: "local" | "kernel";
	[key: string]: any;
}

const computers = {
	async create({ type, ...args }: ComputerConfig) {
		if (type === "kernel") {
			const computer = new KernelPlaywrightComputer(args.cdp_ws_url);
			await computer.enter();
			return { computer };
		} else if (type === "local") {
			const computer = new LocalPlaywrightComputer(args.headless);
			await computer.enter();
			return { computer };
		} else {
			throw new Error(`Unknown computer type: ${type}`);
		}
	},
};

export default computers;
