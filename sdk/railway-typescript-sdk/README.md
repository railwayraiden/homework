note : merge with updated sdk that's in server

# Railway Typescript SDK

SDK to use Railway IaC with typescript
The SDK wraps the Railway GraphQL API and defines simple methods to manage Railway projects, services, environments.

## Installation

```bash
npm install @railway/sdk
```

Your env / .env file should have the following variables:

```env
RAILWAY_API_TOKEN=your_api_token # required
RAILWAY_TEAM_ID=your_team_id # some methods require it
RAILWAY_PROJECT_ACCESS_TOKEN=your_project_access_token # optional , will be used if defined
```

- If `RAILWAY_TEAM_ID` is found, it will be inserted with variables (as `teamId`) in all graphql queries/mutations
- If `RAILWAY_PROJECT_ACCESS_TOKEN` is found, it will be inserted as header in queries (as header : { 'project-access-token': 'your_project_access_token' } ) in all graphql queries/mutations

## Usage

### Init

```typescript
import { RailwaySdkClient } from "@railway/sdk";

// if env variables found , will auto load configuration
const railway = new RailwaySdkClient({});

// or can be declared
const railway = new RailwaySdkClient({
	apiToken: process.env.RAILWAY_API_TOKEN,
	teamId: process.env.RAILWAY_TEAM_ID,
	projectAccessToken: process.env.RAILWAY_PROJECT_ACCESS_TOKEN,
});
```

### Use the GraphQL API

```typescript
// graphql query
// if data {} is not provided , it will return the full object with all toplevel fields

const projectData = await railway.graphql.query({
    project: { // graphql query name
        data : { // data to fetch
            id: true,
            name: true,
            services: {
                edges: {
                node: {
                    id: true,
                    name: true,
                }
            }
        },
        variables: { // variables to provide
            id: "aa00bee7-0aa5-4f0f-bbd4-1e7685f4ca37" // a project id
        }
    }
})

/* --- response
{
  project: {
    id: "aa00bee7-0aa5-4f0f-bbd4-1e7685f4ca37",
    name: "test-project",
    services: {
      edges: [
        {
          node: {
            id: "00f4f15c-3e2e-432b-8c05-56efcb88a9f2",
            name: "function-bun",
          },
        }, {
          node: {
            id: "00f358-8d66-4e07-9460-f19bbbd13043",
            name: "postgres",
          },
        }
      ],
    },
  },
}
*/

// graphql mutation

const serviceDeletion = await railway.graphql.mutation({
  serviceDelete: { // mutation name
    variables: {
        // id of service in project where name is "function-bun"
      id: projectData.project.services.edges
          .find((edge) => edge.node.name === "function-bun").node.id
    }
  }
})

/* --- response
{
  serviceDelete: true,
}
*/

// use raw graphql

const projectsData = await railway.graphql.raw(
  `query me {
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
```

### Use services methods

```typescript
// Create an empty service
const emptyService = await railway.services.create({
	projectId,
	name: "serviceEmpty",
});

// Create a service from a template (templateId is the template code)
const templateService = await railway.services.create({
	projectId,
	templateId: "redis",
	name: "serviceFromTemplate",
});

// Create a service from a GitHub repo
const githubService = await railway.services.create({
	projectId,
	repo: "railwayapp-templates/gin",
	name: "serviceFromGithubRepo",
});

// Create a service from a Docker image
const dockerService = await railway.services.create({
	projectId,
	image: "hello-world",
	name: "serviceFromDockerImage",
});

// Create a service from a local directory
const localDirService = await railway.services.create({
	projectId,
	dir: "./examples/music-project/api-py",
	name: "serviceFromLocalPythonApi",
	variables: { SOME_KEY: "test_value_123" },
});

// Delete a service , can either provide serviceId or name
const deletedService = await railway.services.delete({
	projectId,
	name: "serviceEmpty",
});

// Batch delete services (in a single commit)
const deletedServices = await railway.services.delete({
	projectId,
	serviceIds: ["serviceFromDockerImage", "serviceFromLocalPythonApi"],
});
```
