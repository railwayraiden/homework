import { RailwaySdkClient } from "./sdk";
import chalk from "chalk";

const railway = new RailwaySdkClient({});
const projectId = "b50757d7-d0a0-4779-a613-a1b1b90ebd62";

async function run() {
	console.dir({ test_sdk_services: "run" });
	/*
    console.dir(
        {
            "create:service-empty" : await railway.services.create({
                projectId,
                name: "accomplished-rebirth",
            })
        },
        {depth:null}
    )




    console.dir(
      {
          "create:service-from-template" : await railway.services.create({
              projectId,
              templateId: "redis",
              name: "service-template",
          })
      },
      {depth:null}
  )


    console.dir(
        {
            "delete:service-empty" : await railway.services.delete({
                projectId,
                name: "accomplished-rebirth",
            })
        },
        {depth:null}
    )

    console.dir(
      {
          "create:service-from-github-repo" : await railway.services.create({
              projectId,
              repo: "railwayapp-templates/gin",
              name: "service-repo-from-github",
          })
      },
      {depth:null}
  )


    console.dir(
        {
            "create:service-from-docker-image" : await railway.services.create({
                projectId,
                image: "hello-world",
                name: "service-docker-image",
            })
        },
        {depth:null}
    )
    */
	/*
    console.dir(
        {
            "create:service-from-local-dir" : await railway.services.create({
                projectId,
                dir: "./examples/music-project/api-py",
                name: "service-localdir-api-py",
                variables: { SOME_KEY: 'test_value_123'  },
            })
        },
        {depth:null}
    )
  */
}

async function deleteAllServices() {
	const services = await railway.graphql.query({
		project: {
			variables: { id: projectId },
			data: { services: { edges: { node: { id: true, name: true } } } },
		},
	});
	await railway.services.delete({
		projectId,
		serviceIds: services.project.services.edges.map((e) => e.node.id),
	});
}

// run();
deleteAllServices();
