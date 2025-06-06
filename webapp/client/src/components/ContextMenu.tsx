import React from "react";
import {
	FaGithub,
	FaLayerGroup,
	FaDatabase,
	FaBox,
	FaTerminal,
	FaFolderPlus,
} from "react-icons/fa";

type Props = {
	x: number;
	y: number;
	visible: boolean;
	onUploadClick: () => void;
	onAdaptRepoClick: () => void;
};

export default function ContextMenu({
	x,
	y,
	visible,
	onUploadClick,
	onAdaptRepoClick,
}: Props) {
	if (!visible) return null;
	return (
		<div
			style={{ top: y, left: x }}
			className="fixed z-50 min-w-[220px] bg-[#13111c] rounded-md p-2 shadow-lg border border-[#272530] border-2"
		>
			<div className="text-xs text-[#91909b] px-2 py-1">Add New Service</div>

			<div
				className="text-sm flex items-center px-3 py-2 cursor-pointer
                  text-green-500 hover:bg-[#1f132a] hover:text-[#7835b9] group"
				onClick={onAdaptRepoClick}
			>
				<FaGithub className="mr-3 group-hover:text-[#7835b9] text-green-500 animate-bounce hover:animate-none" />{" "}
				Adapt Repo (Beta)
			</div>

			<div className="text-sm flex items-center px-3 py-2  text-[#91909b] hover:bg-[#111] opacity-30 group">
				<FaLayerGroup className="mr-3" /> Template
			</div>
			<div className="text-sm flex items-center px-3 py-2  text-[#91909b] hover:bg-[#111] opacity-30 group">
				<FaDatabase className="mr-3" /> Database
			</div>
			<div className="text-sm flex items-center px-3 py-2  text-[#91909b] hover:bg-[#111] opacity-30 group">
				<FaBox className="mr-3" /> Docker Image
			</div>
			<div className="text-sm flex items-center px-3 py-2  text-[#91909b] hover:bg-[#111] opacity-30 group">
				<FaTerminal className="mr-3" /> Empty Service
			</div>
			<div
				className="text-sm flex items-center px-3 py-2 cursor-pointer
                  text-green-500 hover:bg-[#1f132a] hover:text-[#7835b9] group"
				onClick={onUploadClick}
			>
				<FaFolderPlus className="mr-3 group-hover:text-[#7835b9] text-green-500 animate-bounce hover:animate-none" />{" "}
				Upload Local Project
			</div>
		</div>
	);
}
