// FileTree.tsx
import React, { useState, useRef, useEffect } from "react";
import { FiFolder, FiFile, FiX } from "react-icons/fi";

type Node = {
	name: string;
	size: number;
	file?: File;
	children?: Node[];
};

const formatSize = (b: number) => {
	if (b < 1024) return b + " B";
	if (b < 1024 * 1024) return (b / 1024).toFixed(2) + " KB";
	return (b / (1024 * 1024)).toFixed(2) + " MB";
};

export default function FileTree({
	tree,
	onRemove,
}: {
	tree: Node[];
	onRemove: (path: string) => void;
}) {
	return (
		<div className="">
			<ul>
				{tree.map((n, i) => (
					<TreeNode node={n} path={n.name} key={i} onRemove={onRemove} />
				))}
			</ul>
		</div>
	);
}

function TreeNode({
	node,
	path,
	onRemove,
}: {
	node: Node;
	path: string;
	onRemove: (path: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const [previewSrc, setPreviewSrc] = useState<string | null>(null);
	const [snippet, setSnippet] = useState<string>("");
	const [hovering, setHovering] = useState(false);

	const hasChildren = !!node.children?.length;
	const isFile = !!node.file;
	const mime = node.file?.type || "";
	const isImage = mime.startsWith("image/");
	const isMedia =
		(mime.startsWith("video/") && !node.name.endsWith(".ts")) ||
		mime.startsWith("audio/") ||
		node.name.endsWith(".wav");

	useEffect(() => {
		if (!hovering || !node.file) return;
		if (isImage || isMedia) {
			const url = URL.createObjectURL(node.file);
			setPreviewSrc(url);
			return () => URL.revokeObjectURL(url);
		} else {
			const reader = new FileReader();
			reader.onload = () => {
				const text = reader.result as string;
				setSnippet(text.slice(0, 10_000) + (text.length > 10_000 ? "…" : ""));
			};
			reader.readAsText(node.file);
		}
	}, [hovering, node.file]);

	return (
		<li className="ml-4 relative">
			<div
				className="flex items-center space-x-2 cursor-pointer text-sm select-none"
				onClick={() => {
					if (hasChildren) setOpen(!open);
					else if (isFile) setExpanded(!expanded);
				}}
				onMouseEnter={() => setHovering(true)}
				onMouseLeave={() => setHovering(false)}
			>
				{hasChildren ? (
					<FiFolder
						className={`transition-transform ${
							open ? "text-[#8f4ac9] rotate-12" : "text-[#7835b9]"
						}`}
					/>
				) : (
					<FiFile className="text-[#91909b]" />
				)}
				<span className="truncate">{node.name}</span>
				<span className="ml-auto text-xs text-gray-500">
					{formatSize(node.size)}
				</span>
				{hasChildren && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onRemove(path);
						}}
						className="text-gray-300 opacity-30 hover:opacity-100 hover:text-red-700 hover:scale-105 duration-100"
					>
						<FiX size={15} />
					</button>
				)}
			</div>

			{hovering && node.file && (
				<div
					className="absolute top-full left-10 mt-1 z-50 p-2 bg-[#181521] border border-[#272530] rounded shadow-lg w-[30vw]"
					style={{ zIndex: 99 }}
				>
					{isImage && previewSrc && (
						<img src={previewSrc} className="max-w-full max-h-40 object-contain" />
					)}
					{isMedia &&
						previewSrc &&
						(isMedia && mime.startsWith("video/") ? (
							<video src={previewSrc} controls className="w-full max-h-40" />
						) : (
							<audio src={previewSrc} controls className="max-w-[50vw]" />
						))}
					{!isImage && !isMedia && (
						<pre className="text-xs whitespace-pre-wrap break-words line-clamp-5">
							{snippet || "Loading…"}
						</pre>
					)}
				</div>
			)}

			{expanded && node.file && (
				<div className="pl-8 pb-2">
					{isImage && previewSrc ? (
						<img
							src={previewSrc}
							className="max-w-full max-h-96 object-contain rounded border border-[#272530]"
						/>
					) : isMedia && previewSrc ? (
						mime.startsWith("video/") ? (
							<video src={previewSrc} controls className="my-4 max-w-[50vw]" />
						) : (
							<audio src={previewSrc} controls className="my-4 max-w-[50vw]" />
						)
					) : (
						<pre className="text-xs bg-[#181521] p-2 border border-[#272530] rounded max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
							{snippet}
						</pre>
					)}
				</div>
			)}

			{hasChildren && open && (
				<ul>
					{node.children!.map((child, idx) => (
						<TreeNode
							node={child}
							path={`${path}/${child.name}`}
							key={idx}
							onRemove={onRemove}
						/>
					))}
				</ul>
			)}
		</li>
	);
}
