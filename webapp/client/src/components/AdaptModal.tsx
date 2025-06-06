// AdaptModal.tsx
import React, { useState, useEffect, useCallback } from "react";
import { FaGithub } from "react-icons/fa";
import Spinner from "./Spinner";
import { API_BASE_URL } from "../config";

interface AdaptModalProps {
	isOpen: boolean;
	onClose: () => void;
	projectId?: string | null;
	projectName?: string | null;
}

type AdaptStep = "initial" | "adapt" | "fix" | "error" | "loading";

interface ParsedFile {
	path: string;
	content: string;
}

interface ParsedService {
	name: string;
	type?: string;
	files: ParsedFile[];
}

interface ParsedProject {
	services: ParsedService[];
}

interface StreamMessage {
	delta?: string;
	error?: string;
	logs?: string;
}

const AdaptModal: React.FC<AdaptModalProps> = ({
	isOpen,
	onClose,
	projectId,
	projectName,
}) => {
	const [repoInput, setRepoInput] = useState("railwayraiden/DemoApp");
	const [currentStep, setCurrentStep] = useState<AdaptStep>("initial");
	const [xmlStreamBuffer, setXmlStreamBuffer] = useState("");
	const [parsedProjectData, setParsedProjectData] =
		useState<ParsedProject | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [fixLogs, setFixLogs] = useState<string | null>(null);

	/* ---------- helpers ---------- */

	const autoClosePartialXml = (xml: string): string => {
		let out = xml;

		const openProject = (out.match(/<project>/g) || []).length;
		const closeProject = (out.match(/<\/project>/g) || []).length;
		if (openProject > closeProject)
			out += "</project>".repeat(openProject - closeProject);

		const openService = (out.match(/<service\b[^>]*>/g) || []).length;
		const closeService = (out.match(/<\/service>/g) || []).length;
		if (openService > closeService)
			out += "</service>".repeat(openService - closeService);

		const openFile = (out.match(/<file\b[^>]*>/g) || []).length;
		const closeFile = (out.match(/<\/file>/g) || []).length;
		if (openFile > closeFile) out += "</file>".repeat(openFile - closeFile);

		return out;
	};

	const parseXmlStream = useCallback(
		(xml: string, current: ParsedProject | null): ParsedProject | null => {
			const project: ParsedProject = current
				? { ...current, services: [...current.services] }
				: { services: [] };

			const serviceRegex =
				/<service\s+name="([^"]+)"(?:\s+type="([^"]+)")?>(.*?)<\/service>/gs;
			const fileRegex = /<file\s+path="([^"]+)">(.*?)<\/file>/gs;

			let serviceMatch;
			while ((serviceMatch = serviceRegex.exec(xml)) !== null) {
				const [_, svcName, svcType, svcBody] = serviceMatch;

				let service = project.services.find((s) => s.name === svcName);
				if (!service) {
					service = { name: svcName, type: svcType, files: [] };
					project.services.push(service);
				} else {
					if (svcType && service.type !== svcType) service.type = svcType;
				}

				service.files = []; // rebuild every cycle for simplicity
				let fileMatch;
				while ((fileMatch = fileRegex.exec(svcBody)) !== null) {
					const [__, filePath, fileContent] = fileMatch;
					service.files.push({ path: filePath, content: fileContent });
				}
			}

			return project.services.length ? project : null;
		},
		[],
	);

	/* ---------- effects ---------- */

	useEffect(() => {
		if (isOpen) {
			setCurrentStep("initial");
			setXmlStreamBuffer("");
			setParsedProjectData(null);
			setErrorMessage(null);
			setFixLogs(null);
		}
	}, [isOpen]);

	/* ---------- main workflow ---------- */

	const handleAdaptWorkflow = useCallback(async () => {
		if (!repoInput.trim()) {
			setErrorMessage("Repository input cannot be empty.");
			setCurrentStep("error");
			return;
		}

		setCurrentStep("loading");
		setXmlStreamBuffer("");
		setParsedProjectData(null);
		setErrorMessage(null);
		setFixLogs(null);

		try {
			const response = await fetch(`${API_BASE_URL}/workflow/adapt`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ repo: repoInput, projectId }),
				keepalive: true,
			});

			if (!response.ok) {
				const errText = await response.text();
				throw new Error(errText || "Failed to start adaptation.");
			}

			if (!response.body) throw new Error("Stream missing.");

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let leftover = "";

			setCurrentStep("adapt");

			/* stream loop */
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;

				leftover += decoder.decode(value, { stream: true });
				const lines = leftover.split("\n");

				for (let i = 0; i < lines.length - 1; i++) {
					const line = lines[i].trim();
					if (!line) continue;
					const sepIdx = line.indexOf("]");
					if (sepIdx < 2 || line[0] !== "[") continue;

					const stepRaw = line.slice(1, sepIdx).toLowerCase();
					const jsonStr = line.slice(sepIdx + 1).trim();

					if (stepRaw === "end") {
						onClose();
						return;
					}

					let payload: StreamMessage;
					try {
						payload = JSON.parse(jsonStr);
					} catch {
						continue;
					}

					if (payload.error) {
						setErrorMessage(payload.error);
						setCurrentStep("error");
						continue;
					}

					if (stepRaw === "adapt" || stepRaw === "fix") {
						setCurrentStep(stepRaw as AdaptStep);
						if (payload.delta) {
							setXmlStreamBuffer((prev) => {
								const updated = prev + payload.delta;
								const closed = autoClosePartialXml(updated);
								const parsed = parseXmlStream(closed, parsedProjectData);
								if (parsed) setParsedProjectData(parsed);
								return updated;
							});
						}
						if (payload.logs) {
							setFixLogs(payload.logs);
						}
					}
				}

				leftover = lines[lines.length - 1];
			}
		} catch (e) {
			setErrorMessage(e instanceof Error ? e.message : String(e));
			setCurrentStep("error");
		} finally {
			setCurrentStep((cs) => (cs === "loading" ? "initial" : cs));
		}
	}, [repoInput, onClose, parseXmlStream, parsedProjectData]);

	/* ---------- render ---------- */

	if (!isOpen) return null;

	const renderContent = () => {
		if (currentStep === "loading") {
			return (
				<div className="flex flex-col items-center justify-center py-10 min-h-[200px]">
					<Spinner
						size="w-10 h-10"
						fillColor="fill-purple-500"
						textColor="text-gray-700"
					/>
					<p className="text-gray-300 mt-4 text-lg">Initializing Adaptation</p>
					<p className="text-sm text-gray-500 mt-1">
						Please wait while we set things up for your repository.
					</p>
				</div>
			);
		}

		if (currentStep === "error")
			return (
				<div>
					<p className="text-red-500">Error: {errorMessage}</p>
					<button
						className="mt-4 px-4 py-2 border border-[#272530] rounded-lg text-sm text-[#91909b] hover:bg-[#1f132a] hover:text-[#7835b9]"
						onClick={() => {
							setCurrentStep("initial");
							setErrorMessage(null);
						}}
					>
						Retry
					</button>
				</div>
			);

		if (currentStep === "adapt" || currentStep === "fix")
			return (
				<div className="flex flex-row gap-6">
					<div className="flex-1 min-w-0">
						<div className="flex items-center pb-2 pt-4 border-b border-gray-600">
							<h3 className="text-lg font-semibold text-gray-100">
								{currentStep === "adapt"
									? "Re-architecturing Project"
									: "Attempting Fixes"}
							</h3>
							<Spinner
								size="w-5 h-5"
								fillColor="fill-purple-400"
								textColor="text-gray-600"
								className="ml-3"
							/>
						</div>
						<p className="text-sm text-gray-400 mb-4 whitespace-pre-wrap break-words font-mono text-white font-light my-8 p-4 bg-[#13111c] rounded-md">
							{currentStep === "adapt"
								? "Analyzing your repository to identify how to structure the project.\nThe aim is to identify the repo structure what services need to be created and how to configure them.\nThis may take a few moments as we parse your project files and generate a new architecture..."
								: "Researching project fixes to make the identified services work after detecting deployment failures and forwarding their logs.\nUpdating project code and configurations to attempt fixing identified issues."}
						</p>
						<div className="w-full h-96 bg-[#13111c] p-3 rounded border border-[#272530] overflow-auto text-xs railway-scrollbar">
							{parsedProjectData?.services.map((svc) => (
								<div key={svc.name} className="mb-4 p-2 bg-[#272530] rounded">
									<h4 className="text-purple-400 mb-1">
										{svc.name}{" "}
										{svc.type && (
											<span className="text-gray-400 text-xs">({svc.type})</span>
										)}
									</h4>
									{svc.files.map((file) => (
										<div key={file.path} className="mb-2 border-l pl-2 border-gray-600">
											<p className="text-cyan-400">{file.path}</p>
											<pre className="bg-[#13111c] p-2 mt-1 rounded overflow-auto max-h-32 text-gray-300">
												{file.content || "..."}
											</pre>
										</div>
									))}
								</div>
							)) || <p className="text-gray-500">Waiting for project data...</p>}
						</div>
					</div>
					{currentStep === "fix" && fixLogs && (
						<div className="w-[480px] max-w-[40vw] h-[50vh] overflow-auto bg-[#18132a] border border-[#3d2e5e] rounded p-4 railway-scrollbar ml-2 flex-shrink-0">
							<h4 className="text-purple-300 mb-2 font-semibold text-sm tracking-wide">
								Build & Deployment Logs
							</h4>
							<pre
								className="text-xs font-mono whitespace-pre-wrap break-words text-[#eacfff] bg-transparent"
								style={{ lineHeight: "1.5" }}
							>
								{fixLogs}
							</pre>
						</div>
					)}
				</div>
			);

		/* initial */
		return (
			<>
				<p className="text-lg font-mono text-white font-light my-8 p-4 bg-[#13111c] rounded-md">
					The Adapt workflow prototype attempts to to port your repo to Railway by
					analyzing it & using generative AI processes.
					<br />
					It would also be useful for migrating projects into Railway, or help create
					new Railway templates faster.
				</p>
				<label className="block text-sm text-gray-400 mb-1">
					GitHub Repository (owner/repo)
				</label>
				<input
					className="w-full p-2 mb-4 rounded bg-[#272530] border border-[#3e3c4a] text-gray-200"
					value={repoInput}
					onChange={(e) => setRepoInput(e.target.value)}
					placeholder="owner/repo"
				/>
				<button
					className="w-full flex items-center justify-center px-4 py-2 bg-purple-600 rounded text-white"
					onClick={handleAdaptWorkflow}
					disabled={currentStep === "loading"}
				>
					<FaGithub className="mr-2" />
					Adapt Repo (Beta)
				</button>
			</>
		);
	};

	return (
		<div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 py-32">
			<div className="bg-[#1A1826] p-6 rounded-lg border border-[#272530] w-full max-w-5xl relative">
				<button
					className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl"
					onClick={onClose}
				>
					&times;
				</button>
				<h2 className="text-xl font-bold mb-4 text-white">
					Adapt Workflow {projectName ? `| ${projectName}` : ""}{" "}
					{projectId && (
						<span className="text-xs font-light mono opacity-50 ml-1">
							({projectId})
						</span>
					)}
				</h2>
				{renderContent()}
			</div>
		</div>
	);
};

export default AdaptModal;
