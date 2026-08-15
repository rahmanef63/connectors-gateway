"use client"

import { usePreloadedQuery, type Preloaded } from "convex/react"

import { EmptyState } from "@/components/empty-state"
import { StatusBadge, toneFrom } from "@/components/status-badge"
import { API_KEY_STATUS_TONES, formatCreated, formatLastUsed, isRevocable, keyReference } from "./format"
import type { apiKeyFunctions } from "./functions"
import { API_KEYS_COPY } from "./labels"
import { readApiKeyViews, type ApiKeyView } from "./read"
import { RevokeApiKeyDialog } from "./revoke-api-key-dialog"

export type PreloadedApiKeys = Preloaded<typeof apiKeyFunctions.listMine>

/**
 * The keys this account holds. The rows carry no secret — the control plane
 * stores a PBKDF2 hash and nothing else, so there is nothing here that a
 * screenshot could leak.
 *
 * Metrics match components/table-skeleton.tsx (same `.card`, same cell padding,
 * same row rule) so nothing moves when the data lands.
 */
export function ApiKeyList({ preloaded }: { preloaded: PreloadedApiKeys }) {
  const views = readApiKeyViews(usePreloadedQuery(preloaded))

  if (views.length === 0) {
    return (
      <EmptyState
        title={API_KEYS_COPY.list.emptyTitle}
        description={API_KEYS_COPY.list.emptyDescription}
      />
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{API_KEYS_COPY.list.caption}</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">
                {API_KEYS_COPY.list.columnLabel}
              </th>
              <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">
                {API_KEYS_COPY.list.columnKey}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {API_KEYS_COPY.list.columnStatus}
              </th>
              <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">
                {API_KEYS_COPY.list.columnCreated}
              </th>
              <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">
                {API_KEYS_COPY.list.columnLastUsed}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">{API_KEYS_COPY.list.columnActions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {views.map((view) => (
              <ApiKeyRow key={view.keyId} view={view} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ApiKeyRow({ view }: { view: ApiKeyView }) {
  const tone = toneFrom(API_KEY_STATUS_TONES, view.status) ?? "neutral"
  return (
    <tr className="border-b border-border last:border-b-0">
      <th scope="row" className="px-4 py-3.5 text-left font-medium">
        {view.label === "" ? API_KEYS_COPY.list.unnamed : view.label}
      </th>
      <td className="hidden px-4 py-3.5 font-mono text-xs text-muted-foreground md:table-cell">
        {keyReference(view.keyId)}
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge tone={tone}>{view.status}</StatusBadge>
      </td>
      <td className="hidden px-4 py-3.5 text-xs text-muted-foreground lg:table-cell">
        {formatCreated(view.createdAt)}
      </td>
      <td className="hidden px-4 py-3.5 text-xs text-muted-foreground lg:table-cell">
        {formatLastUsed(view.lastUsedAt)}
      </td>
      <td className="px-4 py-3.5">
        <div className="flex justify-end">
          {isRevocable(view) ? <RevokeApiKeyDialog view={view} /> : null}
        </div>
      </td>
    </tr>
  )
}

/**
 * Shown when the list could not be preloaded. Creating a key still works, so
 * the screen says that rather than pretending the account has no keys — an
 * empty state here would be a lie that invites a duplicate key.
 */
export function ApiKeyListUnavailable() {
  return (
    <EmptyState
      title={API_KEYS_COPY.list.unavailableTitle}
      description={API_KEYS_COPY.list.unavailableDescription}
    />
  )
}
