import { RailwaySdkClient } from "./sdk";
import chalk from "chalk";

const projectId = "bd8086ce-b7f7-4266-bf9e-757f1978cd86";
const railway = new RailwaySdkClient({});

const result = await railway.graphql.query({
	project: {
		variables: { id: projectId },
		data: {
			environments: {
				edges: {
					node: {
						id: true,
					},
				},
			},
			services: {
				edges: {
					node: {
						id: true,
						name: true,
						serviceInstances: {
							edges: {
								node: {
									id: true,
									environmentId: true,
									latestDeployment: {
										id: true,
										status: true,
										environmentId: true,
										createdAt: true,
										updatedAt: true,
										staticUrl: true,
									},
								},
							},
						},
					},
				},
			},
		},
	},
});

console.dir(result, { depth: null });
/*
	get project : projectId
		services
			networking
				serviceDomains
				tcpProxiesport
*/

/*
  """Get a service instance belonging to a service and environment"""
  serviceInstance(environmentId: String!, serviceId: String!): ServiceInstance!

  try query this and console dir it depth null
*/
async function serviceInstance() {
	// Get project data to extract environmentId and serviceId
	const projectData = await railway.graphql.query({
		project: {
			variables: { id: projectId },
			data: {
				environments: {
					edges: {
						node: {
							id: true,
						},
					},
				},
				services: {
					edges: {
						node: {
							id: true,
							name: true,
							serviceInstances: {
								edges: {
									node: {
										id: true,
										environmentId: true,
									},
								},
							},
						},
					},
				},
			},
		},
	});

	console.dir({ projectData }, { depth: null });
}
// await serviceInstance();

async function logs() {
	// get servicdes from project
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
			},
		},
	});
	console.dir({ servicesData }, { depth: null });
	// for each service : get deployment id (latest)
	// then deployment logs

	/*
        const deploymentsQuery = `
            query deployments($input: DeploymentListInput!) {
                deployments(input: $input, first: 1) {
                    edges {
                        node {
                            id
                            status
                            environmentId
                            createdAt
                            updatedAt
                        }
                    }
                }
            }
        `;
  */
	/*
      const DEPLOYMENT_LOGS_QUERY = `
    query deploymentLogs($deploymentId: String!, $endDate: DateTime, $filter: String, $limit: Int, $startDate: DateTime) {
      deploymentLogs(
        deploymentId: $deploymentId
        endDate: $endDate
        filter: $filter
        limit: $limit
        startDate: $startDate
      ) {
        message
        severity
        timestamp
      }
    }
`;
    */
	const services = servicesData.project.services.edges.map((edge) => edge.node);

	for (const service of services) {
		console.log(chalk.blue(`Fetching deployment for service: ${service.name}`));

		const deploymentData = await railway.graphql.query({
			deployments: {
				variables: {
					input: {
						projectId,
						serviceId: service.id,
					},
				},
				data: {
					edges: {
						node: {
							id: true,
							status: true,
							environmentId: true,
							createdAt: true,
							updatedAt: true,
						},
					},
				},
				first: 1,
			},
		});

		const deploymentEdges = deploymentData.deployments.edges;
		const latestDeployment =
			deploymentEdges.length > 0 ? deploymentEdges[0].node : null;

		if (latestDeployment) {
			console.log(
				chalk.green(
					`Found deployment: ${latestDeployment.id} for service: ${service.name}`,
				),
			);

			const deploymentLogs = await railway.graphql.query({
				deploymentLogs: {
					variables: {
						deploymentId: latestDeployment.id,
						limit: 50,
					},
					data: {
						message: true,
						severity: true,
						timestamp: true,
					},
				},
			});

			console.log(chalk.yellow(`Logs for service ${service.name}:`));
			console.dir(deploymentLogs, { depth: null });
		} else {
			console.log(chalk.red(`No deployments found for service: ${service.name}`));
		}
	}
}

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

// main();
// logs();
