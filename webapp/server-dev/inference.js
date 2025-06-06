import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
const PROMPTS = {};

async function loadPrompts() {
	const promptsDir = path.join(__dirname || process.cwd(), "prompts");
	const files = await fs.readdir(promptsDir);
	for (const file of files) {
		if (file.endsWith(".md")) {
			const filePath = path.join(promptsDir, file);
			const content = await fs.readFile(filePath, "utf8");
			const promptId = path.basename(file, ".md");
			PROMPTS[promptId] = content;
		}
	}
	// console.dir({ PROMPTS });
}
await loadPrompts();

async function generateMessages({ promptId, input = {} }) {
	const prompt = PROMPTS[promptId];
	if (!prompt) throw new Error(`Prompt not found: ${promptId}`);
	// Replace template variables with values from input
	let rendered = prompt;
	for (const [key, value] of Object.entries(input)) {
		const regex = new RegExp(`{{${key}}}`, "g");
		rendered = rendered.replace(regex, value);
	}

	// Parse into messages based on delimiters
	const messages = [];
	const systemStart = `--- <system>`;
	const systemEnd = `--- </system>`;
	const userStart = `--- <user>`;
	const userEnd = `--- </user>`;

	let systemMatch = rendered.match(
		new RegExp(`${systemStart}([\\s\\S]*?)${systemEnd}`),
	);
	if (systemMatch) {
		messages.push({
			role: "system",
			content: systemMatch[1].trim(),
		});
	}

	let userMatch = rendered.match(
		new RegExp(`${userStart}([\\s\\S]*?)${userEnd}`),
	);
	if (userMatch) {
		messages.push({
			role: "user",
			content: userMatch[1].trim(),
		});
	}

	return messages;
}

const openai = new OpenAI();

async function llm({
	model = process.env.LLM_MODEL || "gpt-4o-mini",
	promptId,
	messages = false,
	input = {},
	json = false,
	extract = false,
	stream = false,
	debug_meta = false,
	meta = false, // to handle streams
}) {
	if (stream === true) {
		stream = {
			write: async () => {
				/* just to pass through */
			},
		};
	}
	// Use supplied messages if provided, otherwise generate from promptId/input
	let finalMessages;
	if (messages && Array.isArray(messages) && messages.length > 0) {
		finalMessages = messages;
	} else {
		finalMessages = await generateMessages({ promptId, input });
	}

	console.dir({ "debug:inference:llm": finalMessages }, { depth: null });
	// Handle JSON mode or Structured Outputs
	let textFormat;
	let textFormatOption = {};
	if (json && typeof json === "boolean") {
		// JSON mode (not schema-validated, just valid JSON)
		textFormat = { format: { type: "json_object" } };
		textFormatOption = { text: textFormat };
	} else if (
		json &&
		typeof json === "object" &&
		typeof json.safeParse === "function"
	) {
		// Structured Outputs with Zod schema
		textFormat = {
			format: zodTextFormat(json, "structured_output"),
		};
		textFormatOption = { text: textFormat };
	} else {
		textFormatOption = {};
	}

	// Streaming
	const streamObj = openai.responses
		.stream({
			model,
			input: finalMessages,
			...textFormatOption,
		})
		.on("response.refusal.delta", async (event) => {
			if (stream) {
				process.stdout.write(event.delta);
				await stream.write(event.delta);
			}
		})
		.on("response.output_text.delta", async (event) => {
			if (stream) {
				process.stdout.write(event.delta);
				await stream.write(`[${meta}] ${JSON.stringify({ delta: event.delta })}`);
			}
		})
		.on("response.output_text.done", async () => {
			if (stream) {
				process.stdout.write("\n");
				// await stream.write("\n");
			}
		})
		.on("response.error", (event) => {
			console.error(event.error);
		});

	let result = await streamObj.finalResponse();
	result.output_text = result.output[0].content[0].text;

	// If using Structured Outputs, return parsed object
	if (json && typeof json === "object" && typeof json.safeParse === "function") {
		return result.output_parsed;
	}
	// If using JSON mode, parse output_text
	if (json && typeof json === "boolean") {
		return JSON.parse(result.output_text);
	}

	// Otherwise, extract code block if requested
	let content = result.output_text;
	if (extract && typeof extract === "string") {
		// 1. Find the first line that has "```{extract}"
		const lines = content.split("\n");
		let startIdx = -1;
		let endIdx = -1;

		for (let i = 0; i < lines.length; i++) {
			if (lines[i].trim().toLowerCase() === `\`\`\`${extract.toLowerCase()}`) {
				startIdx = i;
				break;
			}
		}

		// 2. Find the last line in the entire string that has 3 backticks: "```"
		for (let i = lines.length - 1; i > startIdx; i--) {
			if (lines[i].trim() === "```") {
				endIdx = i;
				break;
			}
		}

		// 3. Make content the text block that is between those 2 lines (non inclusive)
		if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
			content = lines
				.slice(startIdx + 1, endIdx)
				.join("\n")
				.trim();
		} else {
			content = "";
		}
	}

	return { content };
}

export default {
	llm,
};
