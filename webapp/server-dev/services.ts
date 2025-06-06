import "dotenv/config";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import tarStream from "tar-stream";
import zlib from "zlib";
import ignore from "ignore";
import fetch from "cross-fetch";
import chalk from "chalk";
import pg from "pg";
import type { RailwaySdkClient } from "./sdk";

export const ENDPOINT = `https://backboard.${process.env.RAILWAY_ENV?.toLowerCase() === "staging" ? "railway-staging.com" : process.env.RAILWAY_ENV?.toLowerCase() === "dev" ? "railway-develop.com" : "railway.app"}/graphql/internal`;

// Map env->host for other endpoints (upload etc.)
const ENV = (process.env.RAILWAY_ENV || "production").toLowerCase();
const HOSTS: Record<string, string> = {
	production: "railway.app",
	staging: "railway-staging.com",
	dev: "railway-develop.com",
};
const HOST = HOSTS[ENV] || HOSTS.production;

/**
 * Perform a raw GraphQL request and return the parsed JSON response. This is a lightweight
 * wrapper around `fetch` so that callers do not need to manually deal with headers and
 * error-handling. Only use this helper for operations which are cumbersome to express in
 * the strongly-typed `genql` selection style (e.g. large template strings).
 */
export async function rawGql<T = any>(
	query: string,
	variables: Record<string, any> = {},
): Promise<T> {
	console.dir({ "debug:rawGql": { query, variables } }, { depth: null });
	const apiToken = process.env.RAILWAY_API_TOKEN;
	if (!apiToken)
		throw new Error("Missing RAILWAY_API_TOKEN environment variable");

	const res = await fetch(ENDPOINT, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiToken}`,
		},
		body: JSON.stringify({
			query,
			variables: { teamId: process.env.RAILWAY_TEAM_ID || null, ...variables },
		}),
	});

	if (!res.ok) {
		throw new Error(`Network error ${res.status}`);
	}

	const json = await res.json();
	if (json.errors?.length) {
		throw new Error(json.errors[0].message);
	}

	return json.data as T;
}

/* -------------------------------------------------------------------------- */
/*                               Public types                                 */
/* -------------------------------------------------------------------------- */

export interface ServiceCreateOptions {
	projectId: string;
	environmentId?: string;
	name?: string;
	repo?: string;
	image?: string;
	dir?: string;
	templateId?: string;
	variables?: Record<string, string>;
	domain?: boolean | { port: number };
}

export interface ServiceInstance {
	id: string;
	name: string;
}

export interface ServiceDeleteOptions {
	/** The ID of the project this service belongs to. Required if deleting by name. */
	projectId?: string;
	/** The ID of the service to delete. */
	serviceId?: string;
	/** The IDs of services to delete in batch. */
	serviceIds?: string[];
	/** The name of the service to delete. `projectId` must also be provided. */
	name?: string;
	/** The ID of the environment this service belongs to. */
	environmentId?: string;
}

/* -------------------------------------------------------------------------- */
/*                     Entry-point to attach helpers to SDK                   */
/* -------------------------------------------------------------------------- */

export function attachServiceHelpers(client: RailwaySdkClient) {
	client.services = {
		create: async (opts: ServiceCreateOptions): Promise<ServiceInstance> => {
			const { projectId } = opts;
			let { environmentId } = opts;

			// auto resolve env if missing
			if (!environmentId) {
				const result = await client.graphql.query({
					project: {
						variables: { id: projectId },
						data: {
							environments: { edges: { node: { id: true } } },
						},
					},
				});
				const edge = (result as any)?.project?.environments?.edges?.[0];
				if (!edge) throw new Error(`Project '${projectId}' has no environments`);
				environmentId = edge.node.id;
			}

			const envId = environmentId as string;
			return createServiceInternal({ ...opts, environmentId: envId });
		},

		delete: async (
			opts: ServiceDeleteOptions,
		): Promise<{
			environmentId?: string;
			serviceId?: string;
			serviceIds?: string[];
			commitMessage?: string;
		}> => {
			let { serviceId, serviceIds, name, projectId, environmentId } = opts;

			// auto resolve env if missing
			if (!environmentId) {
				const result = await client.graphql.query({
					project: {
						variables: { id: projectId },
						data: {
							environments: { edges: { node: { id: true } } },
						},
					},
				});
				const edge = (result as any)?.project?.environments?.edges?.[0];
				if (!edge) throw new Error(`Project '${projectId}' has no environments`);
				environmentId = edge.node.id;
			}

			// Initialize array to track all services to delete
			const servicesToDelete: string[] = [];

			// Handle single service deletion by name
			if (!serviceId && !serviceIds && name && projectId) {
				console.log(
					chalk.blue(
						`▶ Resolving service ID for "${name}" in project "${projectId}"`,
					),
				);
				const projectData = await client.graphql.query({
					project: {
						variables: { id: projectId },
						data: { services: { edges: { node: { id: true, name: true } } } },
					},
				});
				const services =
					(projectData as any)?.project?.services?.edges?.map((e: any) => e.node) ||
					[];
				const foundService = services.find((s: ServiceInstance) => s.name === name);
				if (!foundService) {
					throw new Error(
						`Service with name "${name}" not found in project "${projectId}"`,
					);
				}
				serviceId = foundService.id;
				if (serviceId) servicesToDelete.push(serviceId);
				console.log(chalk.blue(`✓ Resolved service ID: ${serviceId}`));
			} else if (serviceId) {
				servicesToDelete.push(serviceId);
			} else if (serviceIds && serviceIds.length > 0) {
				servicesToDelete.push(...serviceIds);
			} else {
				throw new Error(
					"Either serviceId, serviceIds, or (name and projectId) must be provided to delete services.",
				);
			}

			// Ensure we have valid service IDs
			if (servicesToDelete.length === 0) {
				throw new Error("No valid service IDs could be determined for deletion.");
			}

			console.log(
				chalk.blue(
					`▶ Deleting ${servicesToDelete.length} service(s): ${servicesToDelete.join(", ")}`,
				),
			);

			// Step 1: Stage all service deletions
			const serviceDeletePayload: Record<string, { isDeleted: boolean }> = {};
			servicesToDelete.forEach((id) => {
				serviceDeletePayload[id] = { isDeleted: true };
			});

			const stageChangesQuery = `
        mutation stageEnvironmentChanges($environmentId: String!, $payload: EnvironmentConfig!) {
          environmentStageChanges(environmentId: $environmentId, input: $payload) {
            id
          }
        }
      `;

			const stageResult = await rawGql<{
				environmentStageChanges: { id: string };
			}>(stageChangesQuery, {
				environmentId,
				payload: { services: serviceDeletePayload },
			});

			const stagedChangesId = stageResult.environmentStageChanges.id;

			// Step 2: Commit the staged changes
			const commitQuery = `
        mutation environmentPatchCommitStaged($environmentId: String!, $message: String, $skipDeploys: Boolean) {
          environmentPatchCommitStaged(
            environmentId: $environmentId
            commitMessage: $message
            skipDeploys: $skipDeploys
          )
        }
      `;

			const commitResult = await rawGql<{ environmentPatchCommitStaged: string }>(
				commitQuery,
				{
					environmentId,
					skipDeploys: false,
				},
			);

			console.log(
				chalk.green(
					`✓ ${servicesToDelete.length} service(s) deleted successfully.`,
				),
			);
			return {
				environmentId,
				serviceId: servicesToDelete.length === 1 ? servicesToDelete[0] : undefined,
				serviceIds: servicesToDelete.length > 1 ? servicesToDelete : undefined,
				commitMessage: commitResult.environmentPatchCommitStaged,
			};
		},
	} as any;
}

/* -------------------------------------------------------------------------- */
/*                           Internal implementation                           */
/* -------------------------------------------------------------------------- */

interface InternalOpts extends ServiceCreateOptions {
	environmentId: string;
}

async function createServiceInternal(
	opts: InternalOpts,
): Promise<ServiceInstance> {
	const {
		projectId,
		environmentId,
		name: providedName,
		repo,
		image,
		dir,
		templateId,
		variables,
		domain = true,
	} = opts;

	// Check if service already exists in project
	const existingServices = await rawGql(
		`
		query($id: String!) {
			project(id: $id) {
				services {
					edges {
						node {
							id
							name
						}
					}
				}
			}
		}
	`,
		{ id: projectId },
	);

	console.log(chalk.blue("▶ Creating service"));

	// ------------------------- Auto-detect template -------------------------- //
	let finalTemplateId = templateId;
	if (dir && !finalTemplateId) {
		const railwayJson = path.join(dir, "railway.json");
		if (fs.existsSync(railwayJson)) {
			const cfg = JSON.parse(fs.readFileSync(railwayJson, "utf8"));
			finalTemplateId = cfg?.template?.code;
			if (finalTemplateId)
				console.log(
					chalk.green(`✔ Detected template '${finalTemplateId}' from railway.json`),
				);
		}
	}

	// -------------------------- Auto-derive name ---------------------------- //
	let serviceName = providedName;
	if (!serviceName && dir) {
		serviceName = path.basename(dir);
		console.log(
			chalk.cyan(`• Using directory name as service name '${serviceName}'`),
		);
	}

	// ---------------------- Merge env variables ----------------------------- //
	let mergedVars: Record<string, string> | undefined = variables ?? undefined;
	if (dir) {
		const envPath = path.join(dir, ".env");
		if (fs.existsSync(envPath)) {
			const fileVars = dotenv.parse(fs.readFileSync(envPath));
			mergedVars = mergedVars ? { ...fileVars, ...mergedVars } : fileVars;
			console.log(
				chalk.cyan(`• Loaded ${Object.keys(fileVars).length} vars from .env`),
			);
		}
	}

	// ----------------------------------------------------------------------- //
	let templateDeployment: ServiceInstance | null = null;
	if (finalTemplateId) {
		const services = existingServices.project.services.edges.map((e) => e.node);
		if (!services.some((s) => s.name === serviceName)) {
			console.log(chalk.magenta(`• Deploying template '${finalTemplateId}'`));
			templateDeployment = await deployTemplate({
				code: finalTemplateId,
				projectId,
				environmentId,
				name: serviceName,
			});
			console.log(chalk.green("✔ Template deployment started"));
		} else {
			console.log(
				chalk.yellow(
					`• Service '${serviceName}' already exists, skipping template deployment`,
				),
			);
			// return name and id from existingServices
			return {
				name: existingServices.project.services.edges.find(
					(e) => e.node.name === serviceName,
				)?.node.name,
				id: existingServices.project.services.edges.find(
					(e) => e.node.name === serviceName,
				)?.node.id,
			};
		}
	}
	// console.dir({templateDeployment})
	// ------------------------- Create service ------------------------------ //
	let service: any;
	if (!templateDeployment) {
		let source: any = undefined;
		if (repo) source = { repo };
		if (image) source = { image };

		const existingService = (
			existingServices as any
		)?.project?.services?.edges?.find(
			(edge: any) => edge.node.name === serviceName,
		)?.node;

		if (existingService) {
			service = existingService;
			console.log(chalk.yellow("⚠ Service already exists, skipping creation"));
		} else {
			const mutation = `mutation ServiceCreate($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }`;
			const { serviceCreate } = await rawGql<{ serviceCreate: ServiceInstance }>(
				mutation,
				{
					input: {
						name: serviceName,
						projectId,
						environmentId,
						source,
						variables: mergedVars,
					},
				},
			);
			service = serviceCreate;
			console.log(chalk.green("✔ Service created"));
		}
	} else {
		service = templateDeployment;
	}

	console.dir({ "debug:service": service });

	// ----------------------- Deploy from repo ------------------------------ //
	if (repo && !templateDeployment) {
		const deployMutation = `mutation serviceInstanceDeploy($serviceId: String!, $environmentId: String!, $latestCommit: Boolean) { serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId, latestCommit: $latestCommit) }`;
		await rawGql(deployMutation, {
			serviceId: service.id,
			environmentId,
			latestCommit: true,
		});
		console.log(chalk.green("✔ Repository deployment triggered"));
	}

	// ----------------------- Deploy local dir ------------------------------ //
	if (dir && !templateDeployment) {
		await deployDir({ projectId, environmentId, serviceId: service.id, dir });
		console.log(chalk.green("✔ Local directory deployed"));
	}

	// ---------------------------- Domains ---------------------------------- //
	if (domain === true || (typeof domain === "object" && domain.port)) {
		/*
			poll by querying project to check if service id exists before creating domain
		*/
		const checkService = async () => {
			for (let attempt = 0; attempt < 40; attempt++) {
				try {
					const query = `
				query getService($projectId: String!) {
					project(id: $projectId) {
						services {
							edges {
								node {
									id
									name
									serviceInstances {
										edges {
											node {
												id
												environmentId
											}
										}
									}
								}
							}
						}
					}
				}
			`;
					const result = await rawGql(query, { projectId });
					console.dir(
						{ "debug:services:checkService:result": result },
						{ depth: null },
					);
					const services = result.project.services.edges.map((edge) => edge.node);
					const foundService = services.find(
						(s) => s.id === service.id && s.serviceInstances.edges.length > 0,
					);
					if (foundService) {
						return foundService;
					}
				} catch (err) {
					console.log(
						chalk.yellow(`• debug : service check attempt ${attempt + 1} failed`),
					);
				}
				await new Promise((resolve) => setTimeout(resolve, 4_000));
			}
			console.log(chalk.red("✖ Service check timed out"));
			return null;
		};
		let foundService = await checkService();
		if (foundService) {
			console.log(chalk.green("✔ Service exists"));
		}
		const targetPort = typeof domain === "object" ? domain.port : 8080;
		await rawGql(
			`mutation serviceDomainCreate($environmentId: String!, $serviceId: String!, $targetPort: Int!) { serviceDomainCreate(input: { environmentId: $environmentId, serviceId: $serviceId, targetPort: $targetPort }) { id } }`,
			{ environmentId, serviceId: service.id, targetPort },
		);
		console.log(chalk.green("✔ Domain created"));
	}

	// ----------------------- DB seed for templates ------------------------- //
	if (
		dir &&
		finalTemplateId &&
		["postgres", "mysql"].includes(finalTemplateId)
	) {
		const seedFile = path.join(dir, "seed.sql");
		if (fs.existsSync(seedFile)) {
			console.log(chalk.cyan("• seed.sql found, waiting for DB to be ready"));
			await new Promise((r) => setTimeout(r, 15_000));

			const sql = fs.readFileSync(seedFile, "utf8");

			// poll env vars
			let vars: Record<string, string> | null = null;
			for (let attempt = 0; attempt < 5; attempt++) {
				const resp = await getEnvVars({
					projectId,
					environmentId,
					serviceId: service.id,
				});
				vars = resp.variables;
				const ready =
					finalTemplateId === "postgres"
						? vars.DATABASE_PUBLIC_URL
						: vars.MYSQL_PUBLIC_URL;
				if (ready) break;
				await new Promise((r) => setTimeout(r, 3_000));
			}
			if (vars) {
				if (finalTemplateId === "postgres" && vars.DATABASE_PUBLIC_URL) {
					const client = new pg.Client(vars.DATABASE_PUBLIC_URL);
					await client.connect();
					await client.query(sql);
					await client.end();
					console.log(chalk.green("✔ Postgres seeded"));
				} else if (finalTemplateId === "mysql" && vars.MYSQL_PUBLIC_URL) {
					// Skipping mysql seed implementation for brevity
					console.log(chalk.yellow("⚠ MySQL seed not implemented"));
				}
			}
		}
	}

	console.log(chalk.green.bold("🎉 Service creation finished"));
	return service;
}

/* ----------------------------- Helper actions ----------------------------- */

async function deployTemplate({
	code,
	projectId,
	environmentId,
	name,
}: {
	code: string;
	projectId: string;
	environmentId: string;
	name?: string;
}): Promise<ServiceInstance> {
	const response = await rawGql<any>(
		`query templateDetail($code: String!) {
  template(code: $code) {
    ...TemplateDetailFields
  }
}

fragment TemplateDetailFields on Template {
  ...TemplateFields
  activeProjects
  similarTemplates {
    ...SimilarTemplateFields
  }
  creator {
    ...TemplateCreatorFields
  }
}

fragment TemplateFields on Template {
  ...TemplateMetadataFields
  id
  code
  createdAt
  demoProjectId
  teamId
  config
  serializedConfig
  canvasConfig
  status
  isApproved
  communityThreadSlug
  isV2Template
  health
  projects
}

fragment TemplateMetadataFields on Template {
  name
  description
  image
  category
  readme
  tags
  languages
  guides {
    post
    video
  }
}

fragment SimilarTemplateFields on SimilarTemplate {
  name
  description
  image
  code
  deploys
  createdAt
  teamId
  health
  creator {
    ...TemplateCreatorFields
  }
}

fragment TemplateCreatorFields on TemplateCreator {
  name
  avatar
  username
  hasPublicProfile
}`,
		{ code },
	);

	const { template } = response;
	if (!template) throw new Error(`Template '${code}' not found`);
	console.dir({ template });
	let serializedConfig = template.serializedConfig;
	// If name is provided, update the service name in serializedConfig
	if (name) {
		// Find the first service key in the serializedConfig
		const serviceKeys = Object.keys(serializedConfig.services);
		if (serviceKeys.length > 0) {
			const firstServiceKey = serviceKeys[0];
			serializedConfig.services[firstServiceKey].name = name;
		}
	}

	await rawGql(
		`mutation deploy($input: TemplateDeployV2Input!) { templateDeployV2(input: $input) { workflowId } }`,
		{
			input: {
				serializedConfig,
				templateId: template.id,
				projectId,
				environmentId,
			},
		},
	);

	for (let i = 0; i < 20; i++) {
		const p = await rawGql<any>(
			`query ($id: String!) { project(id: $id) { services { edges { node { id name } } } } }`,
			{ id: projectId },
		);
		const svc = p.project.services.edges
			.map((e: any) => e.node)
			.find((n: any) => (name ? n.name === name : true));
		if (svc) return svc;
		await new Promise((r) => setTimeout(r, 1_000));
	}
	throw new Error("Timed out waiting for service from template deploy");
}

async function getProjectToken({
	projectId,
	environmentId,
}: {
	projectId: string;
	environmentId: string;
}): Promise<string> {
	// Ensure project access token exists
	let project_token;
	const tokensFile = path.join(process.cwd(), ".railway_project_tokens");
	if (fs.existsSync(tokensFile)) {
		const lines = fs.readFileSync(tokensFile, "utf8").trim().split("\n");
		for (const line of lines) {
			const [id, tok] = line.split(":");
			if (id === projectId) {
				project_token = tok;
				break;
			}
		}
	}
	if (!project_token) {
		const mutation = `
      mutation projectTokenCreate($input: ProjectTokenCreateInput!) {
        projectTokenCreate(input: $input)
      }`;
		const variables = {
			input: { name: `sdk-${Date.now()}`, projectId, environmentId },
		};
		const { projectTokenCreate } = await rawGql(mutation, variables);
		project_token = projectTokenCreate;
		fs.appendFileSync(tokensFile, `${projectId}:${project_token}\n`);
	}
	return project_token;
}

interface DeployDirOpts {
	projectId: string;
	environmentId: string;
	serviceId: string;
	dir: string;
}
async function deployDir({
	projectId,
	environmentId,
	serviceId,
	dir,
}: DeployDirOpts) {
	const root = path.resolve(dir);
	const ig = ignore().add([".git", "node_modules"]);
	const pack = tarStream.pack();

	function walk(d: string): string[] {
		return fs.readdirSync(d).flatMap((name) => {
			const full = path.join(d, name);
			return fs.statSync(full).isDirectory() ? walk(full) : full;
		});
	}
	for (const file of walk(root)) {
		const rel = path.relative(root, file);
		if (ig.ignores(rel)) continue;
		const buf = fs.readFileSync(file);
		pack.entry({ name: rel, size: buf.length }, buf);
	}
	pack.finalize();
	const chunks: Buffer[] = [];
	for await (const c of pack) chunks.push(c as Buffer);
	const gz = zlib.gzipSync(Buffer.concat(chunks));

	const url = `https://backboard.${HOST}/project/${projectId}/environment/${environmentId}/up?serviceId=${serviceId}`;
	const headers: Record<string, string> = {
		Authorization: `Bearer ${process.env.RAILWAY_API_TOKEN}`,
		"project-access-token": await getProjectToken({ projectId, environmentId }),
		"Content-Type": "application/gzip",
	};

	if (process.env.RAILWAY_PROJECT_ACCESS_TOKEN) {
		headers["project-access-token"] = process.env.RAILWAY_PROJECT_ACCESS_TOKEN;
	}

	const res = await fetch(url, {
		method: "POST",
		headers,
		body: gz,
	});
	if (!res.ok) throw new Error(`Upload failed ${res.status}`);
}

// ------------------------- Helper: env vars ------------------------------ //
async function getEnvVars({
	projectId,
	environmentId,
	serviceId,
}: {
	projectId: string;
	environmentId: string;
	serviceId: string;
}) {
	const query = `query variables($projectId: String!, $environmentId: String!, $serviceId: String) { variables: variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }`;
	const { variables } = await rawGql<{ variables: Record<string, string> }>(
		query,
		{ projectId, environmentId, serviceId },
	);
	return { variables };
}
