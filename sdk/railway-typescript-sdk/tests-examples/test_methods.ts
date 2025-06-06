import { RailwaySdkClient } from "./index";

// if env variables found , will auto load configuration
const railway = new RailwaySdkClient({});

const projectId = "ace026ce-b686-4755-8ac3-537946effc95";

async function run() {
	console.dir(
		{
			"create:service-empty": await railway.services.create({
				projectId,
				name: "service-empty",
			}),
		},
		{ depth: null },
	);

	console.dir(
		{
			"create:service-from-github-repo": await railway.services.create({
				projectId,
				repo: "railwayapp-templates/gin",
				name: "service-repo",
			}),
		},
		{ depth: null },
	);

	console.dir(
		{
			"delete:service-empty": await railway.services.delete({
				projectId,
				name: "service-empty",
			}),
		},
		{ depth: null },
	);

	console.dir(
		{
			"create:service-from-docker-image": await railway.services.create({
				projectId,
				image: "hello-world",
				name: "service-docker-image",
			}),
		},
		{ depth: null },
	);

	console.dir(
		{
			"create:service-from-local-dir": await railway.services.create({
				projectId,
				dir: "./examples/api-py",
				name: "service-local-dir",
				variables: { SOME_KEY: "test_value_123" },
			}),
		},
		{ depth: null },
	);
}

run();
