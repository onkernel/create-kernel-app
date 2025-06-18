const shared = [
	{
		type: "function",
		name: "goto",
		description: "Go to a specific URL.",
		parameters: {
			type: "object",
			properties: {
				url: {
					type: "string",
					description: "Fully qualified URL to navigate to.",
				},
			},
			additionalProperties: false,
			required: ["url"],
		},
	},
];

export default { shared };
