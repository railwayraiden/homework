import express from "express";
import cors from "cors";
import { RailwaySdkClient } from "./sdk";
import utils from "./utils";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs/promises";
import slugify from "slugify";
import pipelines from "./pipelines";

const railway = new RailwaySdkClient({});
const app = express();
const port = 8080;

// CORS configuration for maximum permissiveness
app.use(cors());

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json({ limit: "50mb" })); // Increased limit for potential large uploads
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// --- API <> CLIENT METHODS ---

// GET /projects
app.get("/projects", async (req, res) => {
	try {
		const projectsData = await railway.graphql.raw(
			`
      query me {
        me {
          workspaces {
            team {
              projects {
                edges {
                  node {
                    id
                    name
                    isPublic
                    deletedAt
                    updatedAt
                  }
                }
              }
            }
          }
        }
      }`,
			{ operationName: "me" },
		);
		const projects = projectsData.me.workspaces
			.map(
				(w) =>
					w.team?.projects?.edges?.map((e) => ({
						...e.node,
						projectId: e.node.id,
					})) || [],
			)
			.flat()
			.filter((p) => p && !p.deletedAt)
			.sort(
				(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
			); // Ensure proper date comparison
		res.json({ projects });
	} catch (error) {
		console.error("Error fetching projects:", error);
		res.status(500).json({ error: "Failed to fetch projects" });
	}
});

// GET /services/:projectId
app.get("/services/:projectId", async (req, res) => {
	try {
		const { projectId } = req.params;
		const { services } = await utils.getProjectServicesDeployments({
			projectId,
			all: true,
		});
		res.json({ services });
	} catch (error) {
		console.error(
			`Error fetching services for project ${req.params.projectId}:`,
			error,
		);
		res.status(500).json({ error: "Failed to fetch services" });
	}
});

// DELETE /services
app.delete("/services", async (req, res) => {
	try {
		const { projectId, serviceId } = req.body;
		if (!projectId || !serviceId) {
			return res
				.status(400)
				.json({ error: "projectId and serviceId are required in the body" });
		}
		await railway.services.delete({ projectId, serviceId });
		res.json({ success: true, serviceId });
	} catch (error) {
		console.error(
			`Error deleting service ${req.body.serviceId} for project ${req.body.projectId}:`,
			error,
		);
		res.status(500).json({ error: "Failed to delete service" });
	}
});

// --- WORKFLOWS ---

const LOCAL_PARALLEL_WRITES = 10;
async function dumpUploadDataLocal({ data }) {
	const id = `upload-${uuidv4()}`;
	const base = path.join("temp", id);
	await fs.mkdir(base, { recursive: true });
	const chunks = [];
	for (let i = 0; i < data.length; i += LOCAL_PARALLEL_WRITES) {
		chunks.push(data.slice(i, i + LOCAL_PARALLEL_WRITES));
	}
	for (const chunk of chunks) {
		await Promise.all(
			chunk.map(async (item) => {
				const safeName = path.normalize(item.name); // Ensure path normalization
				const filePath = path.join(base, safeName);
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, Buffer.from(item.content, "base64"));
			}),
		);
	}
	return { id };
}

async function workflowDeployFromWebUpload({ req, res }) {
	try {
		const { projectId, data } = req.body;
		if (!data || !Array.isArray(data)) {
			return res.status(400).json({ error: "Invalid upload data format." });
		}
		const { id } = await dumpUploadDataLocal({ data }); // projectId not used by dumpUploadDataLocal
		// Assuming utils.deployDir is async or we should await it if it returns a promise and matters for the response
		utils.deployDir({ projectId, dir: `./temp/${id}` });
		res.status(200).json({ success: true });
	} catch (error) {
		console.error("Workflow execution failed (upload):", error);
		res.status(500).json({ error: "Workflow execution failed (upload)" });
	}
}

async function workflowAdaptRepo({ req, res }) {
	res.setHeader("Content-Type", "text/plain");
	res.setHeader("Transfer-Encoding", "chunked"); // Good for streaming
	res.setHeader("X-Content-Type-Options", "nosniff"); // Security header
	res.setHeader("Connection", "keep-alive"); // Keep connection alive for long processes
	res.setTimeout(1200000); // Set timeout to 20 minutes (in milliseconds)

	const stream = {
		write: async (data) => {
			if (!res.writableEnded) {
				// Check if stream is still writable
				res.write(`${data}\n`);
			}
		},
	};

	try {
		let { projectId, repo } = req.body; // projectId might not be used if not creating a new project
		console.dir({ projectId, repo });

		if (!repo || typeof repo !== "string") {
			await stream.write(
				`[error] {"message": "Repository URL is required and must be a string."}`,
			);
			await stream.write(`[end] {}`);
			if (!res.writableEnded) res.end();
			return;
		}

		if (repo.includes("github.com")) {
			try {
				const url = new URL(repo);
				const pathParts = url.pathname.split("/").filter((part) => part);
				if (pathParts.length >= 2) {
					repo = `${pathParts[0]}/${pathParts[1]}`;
				} else {
					throw new Error("Invalid GitHub URL path format");
				}
			} catch (e) {
				await stream.write(
					`[error] {"message": "Invalid GitHub URL format: ${e.message}"}`,
				);
				await stream.write(`[end] {}`);
				if (!res.writableEnded) res.end();
				return;
			}
		}

		const [owner, name] = repo.split("/");

		const id = `repo-${slugify(repo, { lowercase: true, strict: true })}-${uuidv4()}`;
		const projectDirBase = `./temp/${id}`; // Base directory for the repo
		const repoDir = path.join(
			projectDirBase,
			name, // slugify(repo, {replacement: '_', lower: true, strict: true})
		);

		await utils.githubGetRepo({ repo, dir: repoDir }); // Download into repoDir

		let foundRailwayConfigInRepo = false;
		try {
			await fs.access(path.join(repoDir, "railway.toml")); // Check in repoDir
			foundRailwayConfigInRepo = true;
		} catch (error) {
			/* File does not exist */
		}

		if (!foundRailwayConfigInRepo) {
			try {
				await fs.access(path.join(repoDir, "railway.json")); // Check in repoDir
				foundRailwayConfigInRepo = true;
			} catch (error) {
				/* File does not exist */
			}
		}

		if (foundRailwayConfigInRepo) {
			await stream.write(
				`[adapt] {"delta": "<project><service name='${repo}'><file path='railway.toml (or .json)'>Found existing Railway configuration. Skipping adaptation.</file></service></project>"}`,
			);
		} else {
			await pipelines.adapt({
				projectId, // This might be null if not adapting an existing Railway project
				repo,
				id, // This is the unique ID for this adaptation run
				projectPath: repoDir, // Pass the actual path to the downloaded repo
				maxFixAttempts: 3,
				stream,
				download: false, // Already downloaded
			});
		}

		await stream.write(`[end] {}`);
		if (!res.writableEnded) res.end();
	} catch (error) {
		console.error("Workflow execution failed (adapt):", error);
		// Try to send an error message through the stream if possible
		if (!res.headersSent) {
			// If headers not sent, can still send a normal HTTP error
			res.status(500).json({ error: "Workflow execution failed (adapt)" });
		} else if (!res.writableEnded) {
			// If headers sent, try to write to stream
			try {
				await stream.write(
					`[error] {"message": "Workflow execution failed: ${error.message}"}`,
				);
				await stream.write(`[end] {}`);
			} catch (streamError) {
				console.error("Failed to write error to stream:", streamError);
			}
			if (!res.writableEnded) res.end();
		}
	}
}

const workflows = {
	adapt: workflowAdaptRepo,
	upload: workflowDeployFromWebUpload,
};

app.post("/workflow/:workflowId", async (req, res) => {
	const { workflowId } = req.params;
	const workflow = workflows[workflowId];

	if (!workflow) {
		return res.status(404).json({ error: `Workflow ${workflowId} not found` });
	}

	// Pass req and res to the workflow handler
	await workflow({ req, res });
});

app.listen(port, "0.0.0.0", () => {
	// Listen on all available network interfaces
	console.log(`Server listening on http://0.0.0.0:${port}`);
});
