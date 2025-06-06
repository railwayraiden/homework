import React, { useState, useEffect, useCallback } from "react";
import {
	FiTrash2,
	FiExternalLink,
	FiPower,
	FiCheckCircle,
	FiAlertTriangle,
	FiClock,
	FiChevronDown,
	FiChevronRight,
	FiDatabase,
	FiServer,
	FiBox,
} from "react-icons/fi";
import { API_BASE_URL } from "../config";
import Spinner from "./Spinner";

const POLL_MS = 5_000; // Using value from memory

// Match AppProject from App.tsx for consistency
interface Project {
	projectId: string;
	name: string;
	updatedAt: string;
	environment?: string;
}

interface Service {
	serviceId: string;
	name: string;
	type: string;
	status: string;
	updatedAt: string;
	lastDeployed?: string;
	url?: string;
}

interface BackgroundProps {
	projects: Project[];
	selectedProjectId: string | null;
	onSelectProject: (projectId: string | null) => void;
	isLoadingProjects: boolean;
	projectFetchError: string | null;
	// refreshProjects: () => Promise<void>; // If manual refresh from Background is needed
}

const Background: React.FC<BackgroundProps> = ({
	projects,
	selectedProjectId,
	onSelectProject,
	isLoadingProjects,
	projectFetchError,
	// refreshProjects
}) => {
	const [services, setServices] = useState<Service[]>([]);
	const [isLoadingServices, setIsLoadingServices] = useState<boolean>(false);
	const [serviceError, setServiceError] = useState<string | null>(null); // Renamed for clarity
	const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
	const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
	const [deletingServiceId, setDeletingServiceId] = useState<string | null>(
		null,
	);

	const fetchServices = useCallback(async (projectId: string) => {
		if (!projectId) {
			setServices([]); // Clear services if no project is selected
			return;
		}
		setIsLoadingServices(true);
		setServiceError(null);
		try {
			const response = await fetch(`${API_BASE_URL}/services/${projectId}`);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const jsonResponse = await response.json();
			const fetchedServices: Service[] = jsonResponse.services || [];
			setServices(fetchedServices);
		} catch (e: any) {
			console.error("Failed to fetch services:", e);
			setServiceError(
				e.message || "Failed to load services for the selected project.",
			);
			setServices([]); // Clear services on error
		}
		setIsLoadingServices(false);
	}, []);

	useEffect(() => {
		if (selectedProjectId) {
			fetchServices(selectedProjectId);
			const intervalId = setInterval(
				() => fetchServices(selectedProjectId),
				POLL_MS,
			);
			return () => clearInterval(intervalId);
		} else {
			setServices([]); // Clear services if no project is selected
		}
	}, [selectedProjectId, fetchServices]);

	const handleDeleteService = (service: Service) => {
		setServiceToDelete(service);
		setShowConfirmDeleteModal(true);
	};

	const executeDeleteService = async () => {
		if (!serviceToDelete || !selectedProjectId) return;

		setDeletingServiceId(serviceToDelete.serviceId);
		setShowConfirmDeleteModal(false);
		setServiceError(null);

		try {
			const response = await fetch(`${API_BASE_URL}/services`, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					serviceId: serviceToDelete.serviceId,
					projectId: selectedProjectId,
				}),
			});
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({
					message: "Failed to delete service. Unknown server error.",
				}));
				throw new Error(
					errorData.message || `HTTP error! status: ${response.status}`,
				);
			}
			// sleep and manual call fetch services
			await new Promise((resolve) => setTimeout(resolve, 2_000));
			fetchServices(selectedProjectId);
			setServiceToDelete(null);
		} catch (e: any) {
			console.error("Failed to delete service:", e);
			setServiceError(
				e.message || `Failed to delete service ${serviceToDelete.name}.`,
			);
		} finally {
			setDeletingServiceId(null);
		}
	};

	const getServiceIcon = (serviceName: string) => {
		const lowerName = serviceName.toLowerCase();
		if (
			["postgres", "redis", "mysql", "db", "database", "pg", "sql"].some((term) =>
				lowerName.includes(term),
			)
		)
			return <FiDatabase className="w-5 h-5 mr-2 text-blue-400" />;
		if (
			["frontend", "app", "vite", "next", "react", "vue", "web"].some((term) =>
				lowerName.includes(term),
			)
		)
			return <FiBox className="w-5 h-5 mr-2 text-yellow-400" />;
		if (
			["api", "backend", "server", "worker"].some((term) =>
				lowerName.includes(term),
			)
		)
			return <FiServer className="w-5 h-5 mr-2 text-green-400" />;
		return <FiBox className="w-5 h-5 mr-2 text-gray-400" />;
	};

	const getStatusIcon = (status: string) => {
		const lowerStatus = status.toLowerCase();
		if (
			lowerStatus.includes("healthy") ||
			lowerStatus.includes("deployed") ||
			lowerStatus.includes("running") ||
			lowerStatus.includes("available") ||
			lowerStatus.includes("success")
		)
			return <FiCheckCircle className="w-4 h-4 text-green-500" />;
		if (
			lowerStatus.includes("pending") ||
			lowerStatus.includes("building") ||
			lowerStatus.includes("deploying") ||
			lowerStatus.includes("starting")
		)
			return <FiClock className="w-4 h-4 text-yellow-500 animate-pulse" />;
		if (
			lowerStatus.includes("failed") ||
			lowerStatus.includes("error") ||
			lowerStatus.includes("crashed")
		)
			return <FiAlertTriangle className="w-4 h-4 text-red-500" />;
		if (
			lowerStatus.includes("stopped") ||
			lowerStatus.includes("exited") ||
			lowerStatus.includes("sleeping")
		)
			return <FiPower className="w-4 h-4 text-gray-500" />;
		return (
			<Spinner
				size="w-4 h-4"
				fillColor="fill-purple-500"
				textColor="text-gray-700"
			/>
		);
	};

	const currentSelectedProject = projects.find(
		(p) => p.projectId === selectedProjectId,
	);

	// Display loading or error for projects
	if (isLoadingProjects && !projects.length) {
		return (
			<div className="absolute inset-0 p-8 pt-20 flex justify-center items-start text-white">
				<div className="flex items-center">
					<Spinner
						size="w-8 h-8"
						fillColor="fill-purple-500"
						textColor="text-gray-700"
					/>
					<p className="ml-3 text-gray-300">Loading projects...</p>
				</div>
			</div>
		);
	}

	if (projectFetchError) {
		return (
			<div className="absolute inset-0 p-8 pt-20 flex flex-col justify-center items-center text-white">
				<FiAlertTriangle className="w-12 h-12 text-red-400 mb-4" />
				<p className="text-red-400 text-lg">Error loading projects</p>
				<p className="text-red-500 text-sm">{projectFetchError}</p>
				{/* Optional: Add a retry button that calls refreshProjects() */}
			</div>
		);
	}

	if (!projects || projects.length === 0) {
		return (
			<div className="absolute inset-0 p-8 pt-20 flex flex-col justify-center items-center text-white">
				<FiBox className="w-12 h-12 text-gray-500 mb-4" />
				<p className="text-gray-400 text-lg">No projects found.</p>
				<p className="text-gray-500 text-sm">
					Right-click to upload a new project.
				</p>
			</div>
		);
	}

	return (
		<div className="absolute inset-0 p-8 pt-4 bg-opacity-50 text-white flex flex-col space-y-6 overflow-auto railway-scrollbar">
			{/* Header with Project Selector */}
			<div className="flex items-center justify-between mb-6 sticky top-0 z-10 bg-[#13111c] py-4">
				<div className="flex items-center space-x-2">
					<img
						src="https://railway.com/brand/logo-light.svg"
						alt="Railway Icon"
						className="w-8 h-8"
					/>
					{projects.length > 0 && (
						<div className="relative group">
							<button className="flex items-center text-xl font-semibold hover:text-gray-300 focus:outline-none">
								{currentSelectedProject?.name || "Select Project"}{" "}
								<FiChevronDown className="ml-2 w-5 h-5 transition-transform duration-200 group-focus-within:rotate-180" />
							</button>
							<div className="absolute left-0 mt-2 w-64 bg-[#1A1826] border border-[#272530] rounded-md shadow-lg opacity-0 invisible group-focus-within:opacity-100 group-focus-within:visible transition-all duration-200 z-20">
								{projects.map((proj) => (
									<button
										key={proj.projectId}
										onClick={() => onSelectProject(proj.projectId)}
										className={`block w-full text-left px-4 py-3 text-sm hover:bg-[#272530] transition-colors duration-150 ${selectedProjectId === proj.projectId ? "text-purple-400 bg-[#272530]" : "text-gray-300"}`}
									>
										{proj.name}
									</button>
								))}
							</div>
						</div>
					)}
					{projects.length === 0 && (
						<span className="text-xl font-semibold">No Projects Available</span>
					)}
					<span className="text-xl text-gray-500">/</span>
					<span className="text-xl font-semibold text-gray-400">
						{currentSelectedProject?.environment ||
							(projects.length > 0 ? "production" : "N/A")}
					</span>
				</div>
				{/* <button className="px-3 py-1.5 text-sm bg-[#272530] hover:bg-[#3A374A] rounded-md">
          Architecture
        </button> */}
			</div>

			{/* Services Grid */}
			{!selectedProjectId && projects.length > 0 && (
				<div className="text-center py-10">
					<FiChevronRight className="mx-auto w-12 h-12 text-gray-500 mb-3" />
					<p className="text-gray-400">
						Please select a project to view its services.
					</p>
				</div>
			)}

			{/*selectedProjectId && isLoadingServices && services.length === 0 && (
        <div className="flex justify-center items-center h-32">
          <Spinner size="w-8 h-8" fillColor="fill-purple-500" textColor="text-gray-700" />
          <p className="ml-3 text-gray-300">Loading services...</p>
        </div>
      )*/}
			{selectedProjectId && !isLoadingServices && serviceError && (
				<div className="text-center py-4">
					<FiAlertTriangle className="mx-auto w-10 h-10 text-red-400 mb-2" />
					<p className="text-red-400">{serviceError}</p>
				</div>
			)}
			{selectedProjectId && !serviceError && !services.length && (
				<div className="text-center py-10 bg-[#1A1826] rounded-md border border-dashed border-gray-500 border-opacity-50 border-2">
					<FiBox className="mx-auto w-12 h-12 text-gray-500 mb-3" />
					<p className="text-gray-500">
						No services found for {currentSelectedProject?.name}.
					</p>
					<p className="text-xs text-gray-600 mt-1">
						Right-click to upload a new deployment.
					</p>
				</div>
			)}

			{selectedProjectId && services.length > 0 && (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
					{services.map((service) => (
						<div
							key={service.serviceId}
							className="bg-[#1A1826] p-4 rounded-lg border border-[#272530] shadow-lg flex flex-col justify-between hover:border-purple-500 transition-colors duration-150"
						>
							<div>
								<div className="flex items-center justify-between mb-2">
									<div className="flex items-center min-w-0">
										{getServiceIcon(service.name)}
										<h3
											className="text-lg font-medium text-white truncate"
											title={service.name}
										>
											{service.name}
										</h3>
									</div>
									{deletingServiceId === service.serviceId ? (
										<div className="p-1 flex-shrink-0">
											<Spinner
												size="w-4 h-4"
												fillColor="fill-red-500"
												textColor="text-red-200"
											/>
										</div>
									) : (
										<button
											onClick={() => handleDeleteService(service)}
											className="text-gray-500 hover:text-red-500 p-1 rounded-full flex-shrink-0 transition-colors duration-150"
											title="Delete Service"
											disabled={deletingServiceId !== null}
										>
											<FiTrash2 className="w-4 h-4" />
										</button>
									)}
								</div>
								{service.url && (
									<a
										href={
											service.url.startsWith("http://") ||
											service.url.startsWith("https://")
												? service.url
												: `https://${service.url}`
										}
										target="_blank"
										rel="noopener noreferrer"
										className="text-xs text-blue-300 hover:underline flex items-center mb-1 break-all"
									>
										{service.url}{" "}
										<FiExternalLink className="ml-1 w-3 h-3 flex-shrink-0" />
									</a>
								)}
							</div>
							<div className="mt-3 pt-3 border-t border-[#272530]">
								<div className="flex items-center text-xs text-gray-400">
									{getStatusIcon(service.status)}
									<span className="ml-1.5 truncate" title={service.status}>
										{service.status}
									</span>
									{service.lastDeployed && <span className="mx-1">·</span>}
									{service.lastDeployed && (
										<span className="truncate" title={service.lastDeployed}>
											{service.lastDeployed}
										</span>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
			{showConfirmDeleteModal && serviceToDelete && (
				<div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
					<div className="bg-[#1A1826] p-6 rounded-lg shadow-xl max-w-sm w-full border border-[#272530]">
						<h3 className="text-lg font-semibold text-white mb-4">
							Confirm Deletion
						</h3>
						<p className="text-gray-300 mb-6">
							Are you sure you want to delete the service "
							<span className="font-medium text-purple-400">
								{serviceToDelete.name}
							</span>
							" from project "
							<span className="font-medium text-purple-400">
								{currentSelectedProject?.name}
							</span>
							"?
						</p>
						<div className="flex justify-end space-x-3">
							<button
								onClick={() => {
									setShowConfirmDeleteModal(false);
									setServiceToDelete(null);
								}}
								className="px-4 py-2 text-sm font-medium text-gray-300 bg-[#272530] hover:bg-[#3A374A] rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1A1826] focus:ring-gray-500 transition-colors duration-150"
							>
								Cancel
							</button>
							<button
								onClick={executeDeleteService}
								className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1A1826] focus:ring-red-500 transition-colors duration-150"
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default Background;
