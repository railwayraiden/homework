// test local server and stream replies

async function run() {
	const response = await fetch("http://localhost:8080/workflow/adapt", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			projectId: "32ec83cb-ad47-4fdc-8598-56b21a85f28f",
			repo: "railwayraiden/AppDemo",
		}),
	});

	const reader = response.body.getReader();
	const decoder = new TextDecoder();

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		const text = decoder.decode(value, { stream: true });
		console.log(text);
	}
}
run();
