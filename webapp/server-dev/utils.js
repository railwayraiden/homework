import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import { RailwaySdkClient } from "./sdk";
const railway = new RailwaySdkClient({});

async function localDirToXml({ dir }) {
	let services = [];

	// Process directories to find services
	const entries = await fs.readdir(dir, { withFileTypes: true });

	// Process directories as potential services
	for (const entry of entries) {
		if (entry.isDirectory()) {
			const servicePath = path.join(dir, entry.name);
			const serviceFiles = await fs.readdir(servicePath, { withFileTypes: true });

			// Check for database services via railway.json
			try {
				const railwayJsonPath = path.join(servicePath, "railway.json");
				const railwayJsonContent = await fs.readFile(railwayJsonPath, "utf8");
				const railwayJson = JSON.parse(railwayJsonContent);

				if (
					railwayJson.template &&
					["postgres", "redis", "mysql"].includes(railwayJson.template.code)
				) {
					services.push(
						`<service name="${entry.name}" type="${railwayJson.template.code}"></service>`,
					);
					continue;
				}
			} catch (err) {
				// Railway.json doesn't exist or can't be parsed, continue
			}

			// Check if directory contains files that indicate it's a service
			const hasDockerfile = serviceFiles.some(
				(file) => file.isFile() && file.name === "Dockerfile",
			);
			const hasPackageJson = serviceFiles.some(
				(file) => file.isFile() && file.name === "package.json",
			);

			if (hasDockerfile || hasPackageJson) {
				// This directory is likely a service
				const fileContents = await Promise.all(
					serviceFiles
						.filter((file) => file.isFile())
						.map(async (file) => {
							const filePath = path.join(servicePath, file.name);
							try {
								const fileContent = await fs.readFile(filePath, "utf8");
								// Skip non-text files
								if (isTextFile(file.name)) {
									return `<file path="${file.name}">
${fileContent}
</file>`;
								}
								return "";
							} catch (err) {
								return "";
							}
						}),
				);

				const containerContent = fileContents
					.filter((content) => content)
					.join("\n");
				services.push(`<service name="${entry.name}" type="container">
${containerContent}
</service>`);
			}
		}
	}

	// If no services were found in subdirectories, create a default container service with root files
	if (
		services.length === 0 ||
		!services.some((s) => s.includes('type="container"'))
	) {
		const rootFiles = entries.filter((entry) => entry.isFile());
		const fileContents = await Promise.all(
			rootFiles.map(async (file) => {
				const filePath = path.join(dir, file.name);
				try {
					const fileContent = await fs.readFile(filePath, "utf8");
					// Skip non-text files
					if (isTextFile(file.name)) {
						return `<file path="${file.name}">${fileContent}</file>`;
					}
					return "";
				} catch (err) {
					return "";
				}
			}),
		);

		const containerContent = fileContents.filter((content) => content).join("");
		services.push(
			`<service name="app" type="container">${containerContent}</service>`,
		);
	}

	return `<project>
${services.join("\n\n")}
</project>`;
}

function isTextFile(filename) {
	try {
		// Common binary file extensions
		const binaryExtensions = [
			".exe",
			".dll",
			".so",
			".dylib",
			".bin",
			".dat",
			".db",
			".sqlite",
			".jpg",
			".jpeg",
			".png",
			".gif",
			".bmp",
			".ico",
			".webp",
			".tiff",
			".mp3",
			".mp4",
			".mov",
			".avi",
			".mkv",
			".wav",
			".flac",
			".ogg",
			".zip",
			".tar",
			".gz",
			".rar",
			".7z",
			".jar",
			".war",
			".class",
			".pdf",
			".doc",
			".docx",
			".xls",
			".xlsx",
			".ppt",
			".pptx",
			".ttf",
			".otf",
			".woff",
			".woff2",
			".eot",
		];

		// Check file extension
		const ext = path.extname(filename).toLowerCase();
		if (binaryExtensions.includes(ext)) {
			return false;
		}

		// Special case for binary files without recognizable extensions
		const baseName = path.basename(filename).toLowerCase();
		if (/^(\.git|\.ds_store|thumbs\.db)$/.test(baseName)) {
			return false;
		}

		// If not obviously binary by extension, assume it's text
		// In a real implementation, you might want to read the first few bytes
		// to check for binary content (null bytes, etc.)
		return true;
	} catch (err) {
		console.error("Error determining if file is text:", err);
		return false;
	}
}

async function githubGetRepo({
	repo = "owner/reponame",
	dir = "./temp/example-dir",
}) {
	try {
		await fs.mkdir(path.dirname(dir), { recursive: true });
		return new Promise((resolve) => {
			exec(
				`git clone https://github.com/${repo}.git ${dir}`,
				(error, stdout, stderr) => {
					if (error) {
						console.error(`Failed to clone repo ${repo}:`, error);
						resolve(null); // Return null instead of rejecting
						return;
					}
					resolve(dir);
				},
			);
		});
	} catch (err) {
		console.error(`Error in githubGetRepo for ${repo}:`, err);
		return null; // Return null instead of throwing
	}
}

/*
	xmlToLocalDir({dir , xml })
	dir being the project root, ie ./temp/project-123
	here is an example of xml
```
<project>
<service name="PostgresDb" type="postgres"></service>
<service name="ApiPy" type="container">
<file path=".env">
POSTGRES_DB_URL="${{PostgresDb.DATABASE_PUBLIC_URL}}"
</file>
<file path="Dockerfile">
# Use an official Python runtime as a parent image
FROM python:3.10-slim
...
</file>
<file path="railway.json">
{
  "$schema": ...
</file>
<file path="app.py">
from flask import Flask, jsonify, render_template_string
import os
...
</file>
</service>
</project>
```

	- in this case for example, it would extract file contents (USE REGEX TO PARSE THE XML, BECAUSE IT IS PSEUDO XML THEREFORE NO CHARACTER ESCAPES ETC)
	- if service type is either "postgres" or "redis" or "mysql", it would :
		- create a subdir using the specified service name , example here would be : ./temp/project-123/PostgresDb
		- create a railway.json file with inside it :
			```json
			{
				"template": {
					"code": "postgres" (or "redis" or "mysql")
				}
			}
			```
	- if service type is "container", it would :
		- apply changes to the subdir
		- ie. in this case, ./temp/project-123/ApiPy already exists, and it needs to overwrite the files with the new (extract) file contents :
			- ./temp/project-123/ApiPy/Dockerfile
			- ./temp/project-123/ApiPy/railway.json
			- ./temp/project-123/ApiPy/app.py
			...
		- if the files/dirs are non existent (filepath can be nested dirs that also need to be created recusrsively), would simply create and write content to them

	*/
async function xmlToLocalDir({ dir, xml }) {
	try {
		// Create project dir if it doesn't exist
		await fs.mkdir(dir, { recursive: true });

		// Parse the XML to extract services
		const serviceMatches = xml.match(/<service[^>]*>[\s\S]*?<\/service>/g) || [];

		for (const serviceXml of serviceMatches) {
			// Extract service name and type
			const nameMatch = serviceXml.match(/name="([^"]+)"/);
			const typeMatch = serviceXml.match(/type="([^"]+)"/);

			if (!nameMatch || !typeMatch) continue;

			const serviceName = nameMatch[1];
			const serviceType = typeMatch[1];
			const servicePath = path.join(dir, serviceName);

			// Create service directory
			await fs.mkdir(servicePath, { recursive: true });

			// Handle database services (postgres, redis, mysql)
			if (["postgres", "redis", "mysql"].includes(serviceType)) {
				await fs.writeFile(
					path.join(servicePath, "railway.json"),
					JSON.stringify({ template: { code: serviceType } }, null, 2),
				);
				continue;
			}

			// Handle container services
			if (serviceType === "container") {
				// Use regex with lookahead/lookbehind to properly extract file content
				const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
				let fileMatch;

				while ((fileMatch = fileRegex.exec(serviceXml)) !== null) {
					const filePath = fileMatch[1];
					// The content is in the second capture group
					const content = fileMatch[2];

					const fullPath = path.join(servicePath, filePath);
					const fileDir = path.dirname(fullPath);

					// Create nested directories if needed
					await fs.mkdir(fileDir, { recursive: true });

					// Write file content
					await fs.writeFile(fullPath, content);
				}
			}
		}

		return dir;
	} catch (err) {
		console.error(`Error in xmlToLocalDir:`, err);
		return null;
	}
}

async function deployDir({ projectId, dir }) {
	const dirEntries = await fs.readdir(dir, { withFileTypes: true });
	const sortedEntries = [...dirEntries];
	const entryTemplateChecks = await Promise.all(
		sortedEntries
			.filter((entry) => entry.isDirectory())
			.map(async (entry) => {
				const railwayJsonPath = path.join(dir, entry.name, "railway.json");
				try {
					const fileExists = await fs
						.access(railwayJsonPath)
						.then(() => true)
						.catch(() => false);
					if (fileExists) {
						const content = await fs.readFile(railwayJsonPath, "utf8");
						const json = JSON.parse(content);
						return { entry, hasTemplate: !!json?.template?.code };
					}
				} catch (err) {
					// Ignore file reading errors
				}
				return { entry, hasTemplate: false };
			}),
	);
	sortedEntries.sort((a, b) => {
		// Only compare directories
		if (!a.isDirectory() || !b.isDirectory()) return 0;
		const aCheck = entryTemplateChecks.find(
			(check) => check.entry.name === a.name,
		);
		const bCheck = entryTemplateChecks.find(
			(check) => check.entry.name === b.name,
		);
		// Prioritize entries with templates
		if (aCheck?.hasTemplate && !bCheck?.hasTemplate) return -1;
		if (!aCheck?.hasTemplate && bCheck?.hasTemplate) return 1;
		return 0;
	});
	for (const entry of sortedEntries) {
		if (entry.isDirectory()) {
			try {
				console.log(`> creating service for directory: ${entry.name}`);
				await railway.services.create({
					projectId,
					dir: path.join(dir, entry.name),
					name: entry.name,
				});
				// Check if service was created successfully
				const service = await new Promise(async (resolve) => {
					const checkService = async () => {
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
														},
													},
												},
											},
										},
									},
								},
							},
						});
						console.dir({ result });
						const services = result.project.services.edges.map((edge) => edge.node);
						const foundService = services.find((s) => s.name === entry.name);
						if (foundService && foundService.serviceInstances.edges.length > 0) {
							return foundService;
						}
						return null;
					};

					let service = await checkService();
					if (service) {
						resolve(service);
						return;
					}

					let retries = 0;
					const maxRetries = 20;
					const interval = setInterval(async () => {
						service = await checkService();
						if (service) {
							clearInterval(interval);
							resolve(service);
							return;
						}

						retries++;
						if (retries >= maxRetries) {
							clearInterval(interval);
							resolve(null);
						}
					}, 1_000);
				});

				if (service) {
					console.log(
						`> service ${entry.name} created successfully with serviceId: ${service.id}`,
					);
				}
			} catch (e) {
				console.error(`Error creating service for directory ${entry.name}:`, e);
			}
		}
	}
}

async function getLogs({ projectId, serviceId }) {
	const deploymentData = await railway.graphql.query({
		deployments: {
			variables: {
				input: {
					projectId,
					serviceId,
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
		deploymentEdges.length > 0
			? deploymentEdges.reduce((latest, current) => {
					const latestTime = new Date(latest.node.updatedAt).getTime();
					const currentTime = new Date(current.node.updatedAt).getTime();
					return currentTime > latestTime ? current : latest;
				}, deploymentEdges[0]).node
			: null;
	if (latestDeployment) {
		// Get deployment logs
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

		// Get build logs
		const buildLogs = await railway.graphql.query({
			buildLogs: {
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

		// Format build logs
		// Format build logs
		const formattedBuildLogs = buildLogs.buildLogs?.length
			? buildLogs.buildLogs
					.sort(
						(a, b) =>
							new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
					)
					.map((log) => `[${log.severity || "INFO"}] ${log.message}`)
					.join("\n")
			: "No build logs available";

		// Format deployment logs
		const formattedDeployLogs = deploymentLogs.deploymentLogs?.length
			? deploymentLogs.deploymentLogs
					.sort(
						(a, b) =>
							new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
					)
					.map((log) => `[${log.severity || "INFO"}] ${log.message}`)
					.join("\n")
			: "No deploy logs available";

		// Return combined logs
		return `# Build Logs\n\n${formattedBuildLogs}\n\n# Deploy Logs\n\n${formattedDeployLogs}`;
	}
}

async function getServicesDeploymentLogsErrors({
	projectId,
	serviceIds = false,
}) {
	try {
		let services = [];

		// Get project data to map service IDs to names
		const projectData = await railway.graphql.query({
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

		const serviceMap = {};
		projectData.project.services.edges.forEach((edge) => {
			serviceMap[edge.node.id] = edge.node.name;
		});

		if (!serviceIds) {
			const serviceNodes = projectData.project.services.edges.map(
				(edge) => edge.node,
			);

			// Get deployment status for each service
			const deploymentPromises = serviceNodes.map(async (service) => {
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
					deploymentEdges.length > 0
						? deploymentEdges.reduce((latest, current) => {
								const latestTime = new Date(latest.node.updatedAt).getTime();
								const currentTime = new Date(current.node.updatedAt).getTime();
								return currentTime > latestTime ? current : latest;
							}, deploymentEdges[0])?.node
						: null;

				return {
					...service,
					status: latestDeployment?.status || "UNKNOWN",
				};
			});

			services = (await Promise.all(deploymentPromises)).filter(
				(service) => service.status === "CRASHED" || service.status === "FAILED",
			);
		} else {
			services = serviceIds.map((id) => ({
				id,
				name: serviceMap[id] || id,
			}));
		}

		if (services.length === 0) {
			return "No crashed services found";
		}

		const logsPromises = services.map(async (service) => {
			const logs = await getLogs({
				projectId,
				serviceId: service.id,
			});
			return `\`\`\`logs:service:${service.name}\n${logs || "No logs available"}\n\`\`\``;
		});

		const allLogs = await Promise.all(logsPromises);
		return {
			logs: allLogs.join("\n---\n"),
		};
	} catch (error) {
		console.error("Error fetching deployment logs:", error);
		return `Error fetching deployment logs: ${error.message}`;
	}
}
async function getProjectServicesDeployments({ projectId, all = false }) {
	// Get project services with deployments in a single query
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

	// Transform the data to match the original format
	const services = result.project.services.edges.map((edge) => {
		const service = edge.node;
		const serviceInstances = service.serviceInstances?.edges || [];

		// Find the latest deployment across instances
		let latestDeployment = null;
		for (const instance of serviceInstances) {
			const deployment = instance.node.latestDeployment;
			if (!deployment) continue;

			if (
				!latestDeployment ||
				new Date(deployment.updatedAt).getTime() >
					new Date(latestDeployment.updatedAt).getTime()
			) {
				latestDeployment = deployment;
			}
		}

		return {
			serviceId: service.id,
			name: service.name,
			latestDeploymentId: latestDeployment ? latestDeployment.id : null,
			status: latestDeployment ? latestDeployment.status : "UNKNOWN",
			url: latestDeployment ? latestDeployment.staticUrl : null,
			...(latestDeployment || {}),
		};
	});

	return { services };
}

export default {
	localDirToXml,
	githubGetRepo,
	xmlToLocalDir,
	deployDir,
	getLogs,
	getServicesDeploymentLogsErrors,
	getProjectServicesDeployments,
};
