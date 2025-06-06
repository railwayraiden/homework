import utils from "./utils.js";
import pipelines from "./pipelines.js";
// console.dir(await utils.localDirToXml({ dir: "./examples/music-project" }));

await pipelines.adapt({
	projectId: "45adafa5-d358-4b2b-9098-dd9defcf769b",
	repo: "railwayraiden/broken-project",
	maxFixAttempts: 2,
});

/*
console.dir(
    await utils.getServicesDeploymentLogsErrors({projectId: "b50757d7-d0a0-4779-a613-a1b1b90ebd62"}), { depth: null }
);
*/

/*
const { logs } = await utils.getServicesDeploymentLogsErrors({
	projectId: "92c5e51a-39ef-40d5-a47f-5b7d54e9e73f",
});


await pipelines.fix({
	projectId: "92c5e51a-39ef-40d5-a47f-5b7d54e9e73f",
	// repo: "railwayraiden/broken-project",
	id: "92c5e51a-39ef-40d5-a47f-5b7d54e9e73f-44b838a4-0215-4fe4-a872-0bc8c1c97d3d", // debug
	errors: logs,
});

*/
