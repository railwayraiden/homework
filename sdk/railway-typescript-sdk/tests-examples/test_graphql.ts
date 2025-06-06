import { RailwaySdkClient } from "./index";
import chalk from "chalk";

const projectId = "ace026ce-b686-4755-8ac3-537946effc95";

async function main() {
	try {
		console.log(chalk.blue("Initializing Railway SDK Client..."));
		const railway = new RailwaySdkClient({});
		console.log(chalk.green("SDK Client Initialized."));

		const meData = await railway.graphql.query({
			me: {
				// no data{} filter specified, fetches all top-lvl fields
			},
		});
		console.log(
			chalk.green("Me Data Received:"),
			chalk.yellow(JSON.stringify(meData, null, 2)),
		);

		console.log(
			chalk.blue(`\nFetching project details for ID: ${chalk.bold(projectId)}`),
		);
		const projectData = await railway.graphql.query({
			project: {
				variables: {
					id: projectId,
				},
				data: {
					id: true,
					name: true,
				},
			},
		});
		console.log(
			chalk.green("Project Details Received:"),
			chalk.yellow(JSON.stringify(projectData, null, 2)),
		);

		console.log(
			chalk.blue(
				`\nFetching services for project: ${chalk.bold(projectData.project.name)}`,
			),
		);
		const servicesData = await railway.graphql.query({
			project: {
				variables: { id: projectId },
				data: {
					services: {
						edges: {
							node: {
								id: true,
								name: true,
							},
						},
					},
					environments: {
						edges: {
							node: {
								id: true,
								name: true,
							},
						},
					},
				},
			},
		});
		console.log(
			chalk.green("Services Received:"),
			chalk.yellow(JSON.stringify(servicesData, null, 2)),
		);

		console.log(chalk.magenta("\n--- Test Completed ---"));
	} catch (error) {
		console.error(chalk.red("Error during SDK test:"), error);
		process.exit(1);
	}
}

main();
