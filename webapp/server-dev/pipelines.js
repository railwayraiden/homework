import fs from "fs/promises";
import path from "path";
import inference from "./inference.js";
import utils from "./utils.js";
import { v4 as uuidv4 } from "uuid";

/*
    if has railway.json (or the other railway config format) in root, pass
    same if Caddyfile+nixpacks.toml (in case web app)
*/
/*
also differentiate :
    github being repo name = service name and root dir being the service
    in adapt case , will likely need to yield more than one service so do that
*/

const references = {
	adapt: await Promise.all(
		(await fs.readdir("./references/pipelines/adapt"))
			.filter((file) => path.extname(file) === ".md")
			.map((file) =>
				fs.readFile(path.join("./references/pipelines/adapt", file), "utf-8"),
			),
	),
	fix: await Promise.all(
		(await fs.readdir("./references/pipelines/fix"))
			.filter((file) => path.extname(file) === ".md")
			.map((file) =>
				fs.readFile(path.join("./references/pipelines/fix", file), "utf-8"),
			),
	),
};
// console.dir({ "debug:pipelines:references": references });

const POLLING_INTERVAL_MS = 2_500;
const MAX_POLLING_ATTEMPTS = 50;
const POST_DEPLOYMENTS_SLEEP_MS = 10_000;

async function adapt({
	projectId,
	repo,
	id = false,
	maxFixAttempts = 2,
	stream,
	download = true,
}) {
	id = id ? id : `${projectId}-${uuidv4()}`;
	const [owner, name] = repo.split("/");
	const projectDir = `./temp/${id}`;

	if (download) {
		await utils.githubGetRepo({ repo, dir: `${projectDir}/${name}` });
	}
	const projectXml = await utils.localDirToXml({ dir: projectDir });
	console.dir({ projectXml });
	const adaptReply = await inference.llm({
		promptId: "adapt",
		input: {
			exampleRepos: references.adapt.join("\n---\n"),
			project: projectXml,
		},
		stream,
		extract: "xml",
		meta: "adapt",
	});
	await utils.xmlToLocalDir({ dir: projectDir, xml: adaptReply.content });
	await utils.deployDir({ projectId, dir: projectDir });

	/*
        poll every 2_000 ms (with max attempts 50) to check for deployment status
        to know when to stop polling , here are the enum types for deployment status :
        enum DeploymentStatus { BUILDING CRASHED DEPLOYING FAILED INITIALIZING NEEDS_APPROVAL QUEUED REMOVED REMOVING SKIPPED SLEEPING SUCCESS WAITING }
        if all deployments successful (no crashed or failed) , continue
        else :
          const { logs } = await utils.getServicesDeploymentLogsErrors({
                projectId,
                serviceIds: [
                    // services where deployment crashed or failed
                ]
            });
            return await fix({projectId , id , errors : logs })
    */
	let fixAttempts = 0;

	while (fixAttempts < maxFixAttempts) {
		let attempts = 0;
		let deploymentSuccessful = false;

		while (attempts < MAX_POLLING_ATTEMPTS && !deploymentSuccessful) {
			const { services } = await utils.getProjectServicesDeployments({
				projectId,
			});

			// Check if any service is still in progress
			const inProgress = services.filter((svc) =>
				["BUILDING", "DEPLOYING", "INITIALIZING", "QUEUED", "WAITING"].includes(
					svc.status,
				),
			);

			// Check if any service failed
			const failed = services.filter((svc) =>
				["CRASHED", "FAILED"].includes(svc.status),
			);

			if (inProgress.length === 0) {
				// All deployments completed
				// sleep for POST_DEPLOYMENTS_SLEEP_MS, to give it time to crash if problem and generate logs...
				console.warn(
					`> Waiting for ${POST_DEPLOYMENTS_SLEEP_MS / 1000} seconds to allow time for deployments to try launch and crash in case of problems...`,
				);
				await new Promise((resolve) =>
					setTimeout(resolve, POST_DEPLOYMENTS_SLEEP_MS),
				);

				if (failed.length === 0) {
					// All deployments successful
					deploymentSuccessful = true;
					break;
				} else {
					// Some deployments failed
					console.log(
						`Fix attempt ${fixAttempts + 1}/${maxFixAttempts}: Some services failed to deploy`,
					);
					const { logs } = await utils.getServicesDeploymentLogsErrors({
						projectId,
					});

					// Break out of the polling loop to attempt a fix
					break;
				}
			}

			// Wait before next poll
			await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS));
			attempts++;
		}

		if (deploymentSuccessful || attempts >= MAX_POLLING_ATTEMPTS) {
			if (deploymentSuccessful) {
				console.log("All services deployed successfully");
			} else {
				console.log("Deployment polling timed out after maximum attempts");
			}
			break;
		}

		// If we get here, we need to attempt a fix
		const { logs } = await utils.getServicesDeploymentLogsErrors({
			projectId,
		});

		fixAttempts++;
		if (fixAttempts < maxFixAttempts) {
			console.log(`Attempting fix ${fixAttempts}/${maxFixAttempts}`);
			await fix({ projectId, id, errors: logs, stream });
			// After fix, we'll go back to polling in the outer loop
		} else {
			// Last attempt, return the result of fix
			return await fix({ projectId, id, errors: logs, stream });
		}
	}

	return { id, projectId };
}

async function fix({ projectId, id, errors, stream }) {
	stream.write(`[fix] ${JSON.stringify({ logs: errors })}`);
	const projectDir = `./temp/${id}`;
	const projectXml = await utils.localDirToXml({ dir: projectDir });

	const fixReply = await inference.llm({
		promptId: "fix",
		input: {
			exampleRepos: references.fix.join("\n---\n"),
			project: projectXml,
			errors,
		},
		stream,
		extract: "xml",
		meta: "fix",
	});

	await utils.xmlToLocalDir({ dir: projectDir, xml: fixReply.content });
	await utils.deployDir({ projectId, dir: projectDir });

	return { id, projectId };
}
async function analyze({ projectId, repo }) {}
export default {
	analyze,
	adapt,
	fix,
};
