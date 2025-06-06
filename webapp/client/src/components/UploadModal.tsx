// UploadModal.tsx
import React, { useState, useCallback, useRef } from "react";
import FileTree from "./FileTree";
import JSZip from "jszip";
import { FiX, FiCheck, FiFolder, FiFile } from "react-icons/fi";
import Spinner from "./Spinner";
import { API_BASE_URL } from "../config";

type Props = {
	onClose: () => void;
	projectId?: string | null;
	projectName?: string | null;
};
type TreeNode = {
	name: string;
	size: number;
	file?: File;
	children?: TreeNode[];
};

const ignorePatterns = ["node_modules", ".git"];

function shouldIgnore(path: string) {
	const parts = path.split("/");
	return parts.some((part) => ignorePatterns.includes(part));
}

export default function UploadModal({
	onClose,
	projectId: propProjectId,
	projectName: propProjectName,
}: Props) {
	const [tree, setTree] = useState<TreeNode[]>([]);
	const [files, setFiles] = useState<File[]>([]);
	const [loading, setLoading] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [dragType, setDragType] = useState<"folder" | "zip" | null>(null);
	// projectId and projectName are now passed as props
	// const [projectId, setProjectId] = useState<string | null>('32ec83cb-ad47-4fdc-8598-56b21a85f28f');
	// const [projectName, setProjectName] = useState<string | null>('strong-commitment');

	const dragCounter = useRef(0);
	const folderInputRef = useRef<HTMLInputElement>(null);
	const zipInputRef = useRef<HTMLInputElement>(null);

	function buildTree(fileList: File[]): TreeNode[] {
		const root: any = {};
		fileList.forEach((file) => {
			const rel = (file as any).webkitRelativePath || file.name;
			if (shouldIgnore(rel)) return;
			const parts = rel.split("/");
			let curr = root;
			parts.forEach((part, idx) => {
				if (ignorePatterns.includes(part)) return;
				if (!curr[part])
					curr[part] = {
						_meta: { name: part, children: {}, size: 0, file: undefined },
					};
				if (idx === parts.length - 1) {
					curr[part]._meta.size = file.size;
					curr[part]._meta.file = file;
				}
				curr = curr[part]._meta.children;
			});
		});
		function toNodes(obj: any): TreeNode[] {
			return Object.values(obj).map((node: any) => {
				const children = toNodes(node._meta.children);
				const size = node._meta.file
					? node._meta.size
					: children.reduce((sum: number, c) => sum + c.size, 0);
				return {
					name: node._meta.name,
					size,
					file: node._meta.file,
					children: children.length ? children : undefined,
				};
			});
		}
		return toNodes(root);
	}

	const handleFolderUpload = (list: File[]) => {
		const filtered = list.filter(
			(f) => !shouldIgnore((f as any).webkitRelativePath || f.name),
		);
		setFiles(filtered);
		setTree(buildTree(filtered));
	};

	const handleZipUpload = async (file: File) => {
		const zip = await JSZip.loadAsync(file);
		const entries: { path: string; entry: JSZip.JSZipObject }[] = [];
		zip.forEach((path, entry) => {
			if (entry.dir) return;
			if (shouldIgnore(path)) return;
			entries.push({ path, entry });
		});
		const resolved = await Promise.all(
			entries.map(async ({ path, entry }) => {
				const blob = await entry.async("blob");
				const f = new File([blob], path);
				Object.defineProperty(f, "webkitRelativePath", { value: path });
				return f;
			}),
		);
		handleFolderUpload(resolved);
	};

	const handleFolderInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		const list = e.target.files;
		if (!list) return;
		handleFolderUpload(Array.from(list));
	};

	const handleZipInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		const list = e.target.files;
		if (!list?.length) return;
		handleZipUpload(list[0]);
	};

	const handleClear = () => {
		setTree([]);
		setFiles([]);
		setLoading(false);
		setIsDragging(false);
		setDragType(null);
		if (folderInputRef.current) folderInputRef.current.value = "";
		if (zipInputRef.current) zipInputRef.current.value = "";
	};

	const handleConfirm = async () => {
		if (!files.length || !propProjectId) {
			// Optionally, show an error message if projectId is missing
			console.error("Project ID is missing, cannot confirm upload.");
			setLoading(false);
			return;
		}
		setLoading(true);

		// Convert files to base64
		const data = await Promise.all(
			files.map(async (file) => {
				const buffer = await file.arrayBuffer();
				const base64Content = btoa(
					new Uint8Array(buffer).reduce(
						(data, byte) => data + String.fromCharCode(byte),
						"",
					),
				);
				return {
					name: (file as any).webkitRelativePath || file.name,
					content: base64Content,
				};
			}),
		);

		// Send as JSON instead of FormData
		const res = await fetch(`${API_BASE_URL}/workflow/upload`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ projectId: propProjectId, data }),
		});

		const response = await res.json();

		setLoading(false);

		// redirect to : https://railway.com/project/${projectId}
		// if (projectId?.length) window.location.href = `https://railway.com/project/${projectId}`;

		onClose();
	};

	const handleDragEnter = useCallback(
		(e: React.DragEvent) => {
			if (files.length) return;
			e.preventDefault();
			e.stopPropagation();
			dragCounter.current++;
			setIsDragging(true);
			const item = e.dataTransfer.items[0];
			if (item?.kind === "file") {
				const entry = item.webkitGetAsEntry?.();
				if (entry?.isDirectory) setDragType("folder");
				else if (item.getAsFile()?.name.toLowerCase().endsWith(".zip"))
					setDragType("zip");
			}
		},
		[files],
	);

	const handleDragOver = useCallback(
		(e: React.DragEvent) => {
			if (files.length) return;
			e.preventDefault();
			e.stopPropagation();
		},
		[files],
	);

	const handleDragLeave = useCallback(
		(e: React.DragEvent) => {
			if (files.length) return;
			e.preventDefault();
			e.stopPropagation();
			dragCounter.current--;
			if (dragCounter.current === 0) {
				setIsDragging(false);
				setDragType(null);
			}
		},
		[files],
	);

	const handleDrop = useCallback(
		async (e: React.DragEvent) => {
			if (files.length) return;
			e.preventDefault();
			e.stopPropagation();
			dragCounter.current = 0;
			setIsDragging(false);
			setDragType(null);

			// collect files from multiple folders or files
			const collected: File[] = [];
			const itemsList = e.dataTransfer.items;
			for (let i = 0; i < itemsList.length; i++) {
				const item = itemsList[i];
				if (item.kind !== "file") continue;
				const entry = item.webkitGetAsEntry?.();
				if (entry?.isDirectory) {
					const dirFiles = await getFilesFromDirectory(entry);
					collected.push(...dirFiles);
				} else {
					const file = item.getAsFile();
					if (!file) continue;
					const rel = (file as any).webkitRelativePath || file.name;
					Object.defineProperty(file, "webkitRelativePath", { value: rel });
					if (file.name.toLowerCase().endsWith(".zip")) {
						await handleZipUpload(file);
					} else {
						collected.push(file);
					}
				}
			}
			if (collected.length) handleFolderUpload(collected);
		},
		[files],
	);

	const getFilesFromDirectory = async (
		entry: FileSystemEntry,
		base = "",
	): Promise<File[]> => {
		const out: File[] = [];
		if (entry.isDirectory) {
			const reader = (entry as FileSystemDirectoryEntry).createReader();
			const ents = await new Promise<FileSystemEntry[]>((res) =>
				reader.readEntries(res),
			);
			for (const ent of ents) {
				const path = base ? `${base}/${ent.name}` : ent.name;
				if (ignorePatterns.some((pat) => path.split("/").includes(pat))) continue;
				if (ent.isDirectory) out.push(...(await getFilesFromDirectory(ent, path)));
				else {
					const f = await new Promise<File>((r) =>
						(ent as FileSystemFileEntry).file(r),
					);
					Object.defineProperty(f, "webkitRelativePath", { value: path });
					out.push(f);
				}
			}
		}
		return out;
	};

	// Remove file or directory by path
	const handleRemove = (path: string) => {
		const filteredFiles = files.filter((f) => {
			const rel = (f as any).webkitRelativePath || f.name;
			return !(rel === path || rel.startsWith(path + "/"));
		});
		setFiles(filteredFiles);
		setTree(buildTree(filteredFiles));
	};

	return (
		<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
			<div
				className={`bg-[#13111c] rounded-lg p-6 w-[90%] max-w-5xl text-[#91909b] border-2 ${isDragging ? "border-[#7835b9]" : "border-[#272530]"} shadow-xl transition-colors`}
				onDragEnter={handleDragEnter}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				<div className="flex items-center justify-between mb-6">
					<h2 className="text-lg font-medium text-white">
						Upload Local Project {propProjectName ? `| ${propProjectName}` : ""}{" "}
						{propProjectId && (
							<span className="text-xs font-light mono opacity-50 ml-1">
								({propProjectId})
							</span>
						)}
					</h2>
					<button onClick={onClose} className="text-gray-400 hover:text-white">
						<FiX size={20} />
					</button>
				</div>
				{!tree.length && (
					<div className="grid grid-cols-2 gap-4 mb-6">
						<label
							className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer group relative ${files.length ? "pointer-events-none opacity-50" : ""} ${isDragging && dragType === "folder" ? "border-[#7835b9] bg-[#1f132a]" : "border-[#272530] hover:bg-[#1f132a] hover:border-[#7835b9]"}`}
						>
							<FiFolder
								size={32}
								className={`mb-2 ${isDragging && dragType === "folder" ? "text-[#8f4ac9]" : "text-[#7835b9] group-hover:text-[#8f4ac9]"}`}
							/>
							<span className="text-sm font-medium">Upload Folder</span>
							<span className="text-xs text-gray-500 mt-1">
								Select or drag a folder
							</span>
							<input
								ref={folderInputRef}
								type="file"
								webkitdirectory="true"
								multiple
								disabled={!!files.length}
								className="hidden"
								onChange={handleFolderInput}
							/>
							{isDragging && dragType === "folder" && (
								<div className="absolute inset-0 bg-[#7835b9]/10 rounded-lg flex items-center justify-center">
									<span className="text-[#7835b9] font-medium">Drop folder here</span>
								</div>
							)}
						</label>

						<label
							className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer group relative ${files.length ? "pointer-events-none opacity-50" : ""} ${isDragging && dragType === "zip" ? "border-[#7835b9] bg-[#1f132a]" : "border-[#272530] hover:bg-[#1f132a] hover:border-[#7835b9]"}`}
						>
							<FiFile
								size={32}
								className={`mb-2 ${isDragging && dragType === "zip" ? "text-[#8f4ac9]" : "text-[#7835b9] group-hover:text-[#8f4ac9]"}`}
							/>
							<span className="text-sm font-medium">Upload ZIP</span>
							<span className="text-xs text-gray-500 mt-1">
								Select or drag a ZIP archive
							</span>
							<input
								ref={zipInputRef}
								type="file"
								accept=".zip"
								disabled={!!files.length}
								className="hidden"
								onChange={handleZipInput}
							/>
							{isDragging && dragType === "zip" && (
								<div className="absolute inset-0 bg-[#7835b9]/10 rounded-lg flex items-center justify-center">
									<span className="text-[#7835b9] font-medium">Drop ZIP here</span>
								</div>
							)}
						</label>
					</div>
				)}

				{tree.length > 0 && (
					<div className="mb-6 p-4 bg-[#1a1725] rounded-lg border border-[#272530]">
						<div className="text-sm font-medium mb-2 text-white">Structure</div>
						<div className="min-h-[50vh] max-h-[60vh] overflow-y-auto">
							<FileTree tree={tree} onRemove={handleRemove} />
						</div>
					</div>
				)}

				<div className="flex justify-end space-x-3">
					{files.length > 0 && !loading && (
						<button
							onClick={handleClear}
							className="flex items-center px-4 py-2 border border-[#272530] rounded-lg text-sm text-[#91909b] hover:bg-[#1f132a] hover:text-[#7835b9]"
						>
							<FiX className="mr-2" />
							Clear
						</button>
					)}
					<button
						onClick={handleConfirm}
						disabled={!files.length || loading || !propProjectId}
						className="flex items-center px-4 py-2 bg-[#7835b9] text-white rounded-lg text-sm hover:bg-[#8f4ac9] disabled:opacity-50"
					>
						{loading ? (
							<div className="flex items-center">
								<Spinner
									size="w-5 h-5"
									fillColor="fill-white"
									textColor="text-purple-300"
									className="mr-2"
								/>
								Uploading...
							</div>
						) : (
							<>
								<FiCheck className="mr-2" />
								Confirm Upload
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
