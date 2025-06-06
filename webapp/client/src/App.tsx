import React, { useState, useEffect, useCallback } from "react";
import ContextMenu from "./components/ContextMenu";
import UploadModal from "./components/UploadModal";
import AdaptModal from "./components/AdaptModal";
import Background from "./components/Background";
import { API_BASE_URL } from "./config";

interface AppProject {
	projectId: string;
	name: string;
	updatedAt: string;
}

export default function App() {
	const [uploadModalOpen, setUploadModalOpen] = useState(false);
	const [adaptModalOpen, setAdaptModalOpen] = useState(false);
	const [menu, setMenu] = useState<{ x: number; y: number; visible: boolean }>({
		x: 0,
		y: 0,
		visible: false,
	});
	// stream and videoRef seem unused for project logic, removed for brevity if not needed elsewhere
	// const [stream, setStream] = useState<MediaStream | null>(null);
	// const videoRef = useRef<HTMLVideoElement>(null);
	const [projects, setProjects] = useState<AppProject[]>([]);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(true);
	const [projectFetchError, setProjectFetchError] = useState<string | null>(
		null,
	);

	const fetchProjectsForApp = useCallback(async () => {
		setIsLoadingProjects(true);
		setProjectFetchError(null);
		try {
			const response = await fetch(`${API_BASE_URL}/projects`);
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			const jsonResponse = await response.json();
			const fetchedProjects: AppProject[] = jsonResponse.projects || [];
			setProjects(fetchedProjects);

			if (fetchedProjects.length > 0) {
				if (
					!selectedProjectId ||
					!fetchedProjects.find((p) => p.projectId === selectedProjectId)
				) {
					// If no project is selected OR the current selection is not in the new list, select the first one.
					setSelectedProjectId(fetchedProjects[0].projectId);
				}
				// If a valid project is already selected and is in the new list, keep it selected.
			} else {
				// No projects fetched, clear selection.
				setSelectedProjectId(null);
			}
		} catch (e: any) {
			console.error("Failed to fetch projects for app:", e);
			setProjectFetchError(
				e.message || "Failed to load projects. Ensure the API server is running.",
			);
			setProjects([]);
			setSelectedProjectId(null);
		}
		setIsLoadingProjects(false);
	}, [selectedProjectId]); // selectedProjectId is a dependency to re-evaluate default selection logic

	useEffect(() => {
		fetchProjectsForApp();
		// Optional: Add polling for projects in App.tsx if Background.tsx's polling is removed
		// const intervalId = setInterval(fetchProjectsForApp, 10000); // Example polling
		// return () => clearInterval(intervalId);
	}, [fetchProjectsForApp]); // fetchProjectsForApp will change if selectedProjectId changes, causing re-fetch if desired.
	// If re-fetch on selectedProjectId change is not desired, remove selectedProjectId from fetchProjectsForApp deps.

	const handleSelectProject = useCallback((projectId: string | null) => {
		setSelectedProjectId(projectId);
	}, []);

	const onContext = (e: React.MouseEvent) => {
		e.preventDefault();
		setMenu({ x: e.clientX, y: e.clientY, visible: true });
	};
	const closeMenu = () => setMenu((m) => ({ ...m, visible: false }));

	const selectedProject = projects.find(
		(p) => p.projectId === selectedProjectId,
	);

	return (
		<div
			onContextMenu={onContext}
			onClick={closeMenu}
			className="w-screen h-screen overflow-hidden relative bg-[#13111c] bg-[radial-gradient(#2c2a36_1px,transparent_1px)] bg-[length:20px_20px]"
		>
			<Background
				projects={projects}
				selectedProjectId={selectedProjectId}
				onSelectProject={handleSelectProject}
				isLoadingProjects={isLoadingProjects}
				projectFetchError={projectFetchError}
				// fetchProjects={fetchProjectsForApp} // Pass if Background needs to trigger a manual refresh
			/>
			<ContextMenu
				x={menu.x}
				y={menu.y}
				visible={menu.visible}
				onUploadClick={() => {
					setUploadModalOpen(true);
					closeMenu();
				}}
				onAdaptRepoClick={() => {
					setAdaptModalOpen(true);
					closeMenu();
				}}
			/>
			{uploadModalOpen && (
				<UploadModal
					onClose={() => setUploadModalOpen(false)}
					projectId={selectedProjectId}
					projectName={selectedProject?.name || null}
				/>
			)}
			{adaptModalOpen && (
				<AdaptModal
					isOpen={adaptModalOpen}
					onClose={() => setAdaptModalOpen(false)}
					projectId={selectedProjectId}
					projectName={selectedProject?.name || null}
				/>
			)}
		</div>
	);
}
