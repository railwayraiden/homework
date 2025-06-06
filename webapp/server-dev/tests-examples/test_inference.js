import inference from "./inference.js";
await inference.llm({
	messages: [
		{
			role: "user",
			content: "Hello, how are you?",
		},
	],
	stream: {
		write: async (data) => {
			// pass
		},
	},
});
