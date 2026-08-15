/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  AnyComponents,
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as features_audit_queries from "../features/audit/queries.js";
import type * as features_connections_queries from "../features/connections/queries.js";
import type * as features_devices_mutations from "../features/devices/mutations.js";
import type * as features_devices_queries from "../features/devices/queries.js";
import type * as features_pairing_mutations from "../features/pairing/mutations.js";
import type * as features_pairing_queries from "../features/pairing/queries.js";
import type * as features_policy_mutations from "../features/policy/mutations.js";
import type * as features_policy_queries from "../features/policy/queries.js";
import type * as http from "../http.js";
import type * as service_apiKeys from "../service/apiKeys.js";
import type * as service_audit from "../service/audit.js";
import type * as service_connections from "../service/connections.js";
import type * as service_devices from "../service/devices.js";
import type * as service_pairing from "../service/pairing.js";
import type * as service_policy from "../service/policy.js";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "features/audit/queries": typeof features_audit_queries;
  "features/connections/queries": typeof features_connections_queries;
  "features/devices/mutations": typeof features_devices_mutations;
  "features/devices/queries": typeof features_devices_queries;
  "features/pairing/mutations": typeof features_pairing_mutations;
  "features/pairing/queries": typeof features_pairing_queries;
  "features/policy/mutations": typeof features_policy_mutations;
  "features/policy/queries": typeof features_policy_queries;
  http: typeof http;
  "service/apiKeys": typeof service_apiKeys;
  "service/audit": typeof service_audit;
  "service/connections": typeof service_connections;
  "service/devices": typeof service_devices;
  "service/pairing": typeof service_pairing;
  "service/policy": typeof service_policy;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: AnyComponents;
