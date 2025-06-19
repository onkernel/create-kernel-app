import "dotenv/config";
import { Kernel, type KernelContext } from "@onkernel/sdk";
import { chromium } from "playwright";
import { Agent } from "./lib/agent";
import computers from "./lib/computers";

const kernel = new Kernel();
const app = kernel.app("ts-cua");

// LLM API Keys are set in the environment during `kernel deploy <filename> -e ANTHROPIC_API_KEY=XXX`
// See https://docs.onkernel.com/launch/deploy#environment-variables
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');

/**
 * Example app that run an agent using openai CUA
 * Args:
 *     ctx: Kernel context containing invocation information
 *     payload: An object with a `task` property
 * Returns:
 *     An answer to the task, elapsed time and optionally the messages stack
 * Invoke this via CLI:
 *  export KERNEL_API_KEY=<your_api_key>
 *  kernel deploy index.ts -e OPENAI_API_KEY=XXXXX --force
 *  kernel invoke ts-cua cua-task -p "{\"task\":\"current market price range for a used dreamcast\"}"
 *  kernel logs ts-cua -f # Open in separate tab
 */

interface CuaInput {
	task: string;
}

interface CuaOutput {
	elapsed: number;
	response?: Array<object>;
	answer: object;
}

app.action<CuaInput, CuaOutput>(
	"cua-task",
	async (ctx: KernelContext, payload?: CuaInput): Promise<CuaOutput> => {
		const startTime = Date.now();
		const kernelBrowser = await kernel.browsers.create({
			invocation_id: ctx.invocation_id,
		});
		console.log(
			"> Kernel browser live view url: ",
			kernelBrowser.browser_live_view_url,
		);

		if (!payload?.task){
			throw new Error('task is required');
		}

		try {

			// kernel browser
			const { computer } = await computers.create({
				type: "kernel", // for local testing before deploying to Kernel, you can use type: "local"
				cdp_ws_url: kernelBrowser.cdp_ws_url,
			});

			// setup agent
			const agent = new Agent({
				model: "computer-use-preview",
				computer,
				tools: [], // additional function_call tools to provide to the llm
				acknowledge_safety_check_callback: (message: string) => {
					console.log(`> safety check: ${message}`);
					return true; // Auto-acknowledge all safety checks for testing
				},
			});

			// start agent run
			const response = await agent.runFullTurn({
				messages: [
					{
						role: "system",
						content: `- Current date and time: ${new Date().toISOString()} (${new Date().toLocaleDateString("en-US", { weekday: "long" })})`,
					},
					{
						type: "message",
						role: "user",
						content: [
							{
								type: "input_text",
								text: payload.task,
								// text: "go to https://news.ycombinator.com , open top article , describe the target website design (in yaml format)"
							},
						],
					},
				],
				print_steps: true, // log function_call and computer_call actions
				debug: true, // show agent debug logs (llm messages and responses)
				show_images: false, // if set to true, response messages stack will return base64 images (webp format) of screenshots, if false, replaced with "[omitted]""
			});

			console.log("> agent run done");

			const endTime = Date.now();
			const timeElapsed = (endTime - startTime) / 1000; // Convert to seconds

			return {
				// response, // full messages stack trace
				elapsed: parseFloat(timeElapsed.toFixed(2)),
				answer: response?.slice(-1)?.[0]?.content?.[0]?.text ?? null,
			};
		} finally {
			// Note: KernelPlaywrightComputer handles browser cleanup internally
			// No need to manually close browser here
		}
	},
);
