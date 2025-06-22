import "dotenv/config";
import sharp from "sharp";
import OpenAI from "openai";

const BLOCKED_DOMAINS: readonly string[] = [
	"maliciousbook.com",
	"evilvideos.com",
	"darkwebforum.com",
	"shadytok.com",
	"suspiciouspins.com",
	"ilanbigio.com",
] as const;

interface ImageDimensions {
	width: number;
	height: number;
}

interface ComputerCallOutput {
	type: "computer_call_output";
	output?: {
		image_url?: string;
		[key: string]: any;
	};
	[key: string]: any;
}

interface Message {
	[key: string]: any;
}

async function calculateImageDimensions(
	base64Image: string,
): Promise<ImageDimensions> {
	const imageBuffer = Buffer.from(base64Image, "base64");
	const metadata = await sharp(imageBuffer).metadata();
	return { width: metadata.width!, height: metadata.height! };
}

function sanitizeMessage(msg: Message): Message {
	/** Return a copy of the message with image_url omitted for computer_call_output messages. */
	if (msg.type === "computer_call_output") {
		const output = msg.output || {};
		if (typeof output === "object") {
			const sanitized = { ...msg };
			sanitized.output = { ...output, image_url: "[omitted]" };
			return sanitized;
		}
	}
	return msg;
}

async function createResponse(kwargs: any): Promise<any> {
	const openai = new OpenAI();
	try {
		const response = await openai.responses.create(kwargs);
		return response;
	} catch (error: any) {
		console.error(`Error: ${error.status} ${error.message}`);
		throw error;
	}
}

function checkBlocklistedUrl(url: string): boolean {
	/** Return true if the given URL (including subdomains) is in the blocklist. */
	const hostname = new URL(url).hostname || "";
	return BLOCKED_DOMAINS.some(
		(blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`),
	);
}

export default {
	calculateImageDimensions,
	sanitizeMessage,
	createResponse,
	checkBlocklistedUrl,
};
