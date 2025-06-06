import "dotenv/config";
import { createClient, everything } from "./railway-gql-lib";
import types from "./railway-gql-lib/types";
import {
	attachServiceHelpers,
	ServiceCreateOptions,
	ServiceInstance,
	ServiceDeleteOptions,
	rawGql,
} from "./services";

export interface RailwaySdkOptions {
	apiToken?: string;
	teamId?: string;
	projectAccessToken?: string;
}

type RequestEntry = {
	data?: any;
	variables?: Record<string, any>;
};

type GqlRequest = Record<string, RequestEntry>;

/**
 * Main Railway SDK client. Handles authentication, automatic variable injection and thin
 * wrapper around the generated GraphQL client from `railway-gql-lib`.
 */
export class RailwaySdkClient {
	private readonly teamId?: string;
	private readonly client: ReturnType<typeof createClient>;

	public readonly graphql: {
		query<T = any>(req: GqlRequest): Promise<T>;
		mutation<T = any>(req: GqlRequest): Promise<T>;
		raw<T = any>(req: GqlRequest): Promise<T>;
	};

	/**
	 * High-level convenience helpers grouped by category (e.g. services).
	 * Each helper transparently re-uses the underlying `RailwaySdkClient` instance
	 * while delegating complex operations to the battle-tested implementations
	 * located in `_sdk_methods_wip.js`.
	 */
	public services!: {
		/**
		 * Create a new Railway service.
		 */
		create(options: ServiceCreateOptions): Promise<ServiceInstance>;
		/**
		 * Delete an existing Railway service by its ID or name (with projectId).
		 */
		delete(options: ServiceDeleteOptions): Promise<{ id: string }>;
	};

	constructor(options: RailwaySdkOptions = {}) {
		const apiToken = options.apiToken ?? process.env.RAILWAY_API_TOKEN;
		if (!apiToken) {
			throw new Error(
				"RailwaySdkClient – missing `RAILWAY_API_TOKEN` (or apiToken option)",
			);
		}

		this.teamId = options.teamId ?? process.env.RAILWAY_TEAM_ID;
		const projectAccessToken =
			options.projectAccessToken ?? process.env.RAILWAY_PROJECT_ACCESS_TOKEN;

		const headers: Record<string, string> = {
			Authorization: `Bearer ${apiToken}`,
		};
		if (projectAccessToken) {
			headers["project-access-token"] = projectAccessToken;
		}

		// build low-level graphql client
		this.client = createClient({ headers });

		// expose graphql helpers
		this.graphql = {
			query: this.buildMethod("query"),
			mutation: this.buildMethod("mutation"),
			raw: rawGql,
		} as any;

		/* attach high-level helpers (services, domains, etc.) */
		attachServiceHelpers(this);
	}

	/* -------------------------------------------------------------------------- */
	/*                               PRIVATE HELPERS                              */
	/* -------------------------------------------------------------------------- */

	private buildMethod(method: "query" | "mutation") {
		return async <T = any>(request: GqlRequest): Promise<T> => {
			const adaptedRequest = this.adaptRequest(request, method);
			// @ts-ignore – dynamic access is fine
			return this.client[method](adaptedRequest);
		};
	}

	// converts SDK-style request (with data / variables) to genql style
	private adaptRequest(request: GqlRequest, method: "query" | "mutation"): any {
		const adapted: Record<string, any> = {};
		const typeMap: any =
			method === "query" ? (types as any).Query : (types as any).Mutation;

		for (const fieldName of Object.keys(request)) {
			const entry = request[fieldName] ?? {};
			const data = entry.data ?? (everything as any); // full scalar set if none provided
			const args: Record<string, any> = { ...(entry.variables ?? {}) };

			// Only inject teamId if it's expected as an input variable for this operation
			// and not already provided
			if (this.teamId && args.teamId === undefined) {
				// Check if the operation accepts teamId in the schema
				const operationType = typeMap?.[fieldName];
				if (operationType && operationType.teamId) {
					args.teamId = this.teamId;
				}
			}

			if (Object.keys(args).length > 0) {
				(data as any).__args = args;
			}

			adapted[fieldName] = data;
		}

		return adapted;
	}
}

export default {
	RailwaySdkClient,
	everything,
};
