import utils from "./utils";

await utils.githubGetRepo({
	repo: "railwayraiden/broken-project",
	dir: "./temp/example-project/broken-repo",
});

console.dir(await utils.localDirToXml({ dir: "./temp/example-project" }), {
	depth: null,
});
