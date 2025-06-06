/*
  http://localhost:8080/

  implement fetch to api methods of local server and console dir depth null
*/

async function fetchServerApi(endpoint, data = {}, method = "POST") {
	console.dir(
		{
			[`${method} ${endpoint}`]: data,
		},
		{ depth: null },
	);
	try {
		const config = {
			method,
			headers: {
				"Content-Type": "application/json",
			},
		};

		// Add body for non-GET requests
		if (method !== "GET") {
			config.body = JSON.stringify(data);
		}

		// Handle query params for GET requests
		const url = `http://localhost:8080${endpoint}`;

		const response = await fetch(url, config);

		const result = await response.json();
		console.dir(result, { depth: null });
		return result;
	} catch (error) {
		console.error(`Error ${method} ${endpoint}:`, error);
		throw error;
	}
}

const { projects } = await fetchServerApi("/projects", {}, "GET");
const projectId = projects.pop().projectId;
const { services } = await fetchServerApi(`/services/${projectId}`, {}, "GET");

// if services delete the top service
await fetchServerApi(
	"/services/delete",
	{ projectId, serviceId: services.pop().serviceId },
	"DELETE",
);
