/**
 * Connections surface — public shape. Everything else here is internal.
 */
export { ConnectionForm } from "./connection-form"
export { FormField } from "./form-field"
export { ConnectionList } from "./connection-list"
export type { ConnectionRow } from "./connection-list"
export { RemoveConnectionDialog } from "./remove-connection-dialog"
export type { RemovableConnection } from "./remove-connection-dialog"
export { SealInstructions } from "./seal-instructions"
export { connectionFunctions } from "./functions"
export type { UpsertConnectionArgs } from "./functions"
export { DEPLOYMENT_HOSTS } from "./self-hosts"
export {
  AUTH_TYPE_LABELS,
  CONNECTIONS_COPY,
  CONNECTIONS_ERROR_COPY,
  DEFAULT_AUTH_TYPE,
  FIELD_ISSUE_COPY,
  SEAL_COMMAND,
} from "./labels"
export { useRemoveConnection, useUpsertConnection } from "./use-connections"
export type {
  SaveConnectionInput,
  SaveFailure,
  UseRemoveConnection,
  UseUpsertConnection,
} from "./use-connections"
export {
  validateBaseUrl,
  validateConnectionForm,
  validateConnectorId,
  validateSealedToken,
} from "./validate"
export type {
  BaseUrlOptions,
  ConnectionFormInput,
  ConnectionFormResult,
  FieldIssue,
  FieldResult,
} from "./validate"
