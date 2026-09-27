import type { MailAddress } from "@vingroto/core/mail/address"
import type { ListScope, MessageListItem } from "@vingroto/core/protocol/mail"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import * as Effect from "effect/Effect"

import type { Database } from "@/lib/db/database"
import type { MessageSearchRow } from "@/lib/store/message-rows"

import { scoreTerms } from "@/lib/mail/fuzzy"
import { listMessageBodies, listSearchRows, messageIdentity } from "@/lib/store/message-search"

interface ScoredRow {
  readonly row: MessageSearchRow
  readonly score: number
}

const queryTerms = (query: string) =>
  query
    .trim()
    .split(/\s+/u)
    .filter((term) => term.length > 0)

const addressText = (addresses: readonly MailAddress[] | null) =>
  addresses === null
    ? ""
    : addresses.map((address) => `${address.name ?? ""} ${address.address}`).join(" ")

const headerFields = (row: MessageSearchRow) => [
  { text: row.subject ?? "", weight: 1 },
  { text: `${row.fromName ?? ""} ${row.fromAddress ?? ""}`, weight: 0.9 },
  { text: `${addressText(row.to)} ${addressText(row.cc)}`, weight: 0.8 },
  { text: row.snippet ?? "", weight: 0.6 },
]

const toListItem = (row: MessageSearchRow): MessageListItem => ({
  id: row.id,
  uid: row.uid,
  accountId: row.accountId,
  mailboxId: row.mailboxId,
  mailboxPath: row.mailboxPath,
  subject: row.subject,
  fromName: row.fromName,
  fromAddress: row.fromAddress,
  date: row.date,
  seen: row.seen,
  flagged: row.flagged,
  size: row.size,
  hasAttachments: row.hasAttachments,
  snippet: row.snippet,
})

const byRank = (left: ScoredRow, right: ScoredRow) =>
  right.score - left.score ||
  (right.row.date ?? 0) - (left.row.date ?? 0) ||
  right.row.id - left.row.id

const matchRows = Effect.fn("Search.matchRows")(function* matchRowsForQuery(
  scope: ListScope,
  query: string,
  hits: ReadonlySet<string>,
): Effect.fn.Return<readonly ScoredRow[], EffectDrizzleQueryError, Database> {
  const terms = queryTerms(query)
  if (terms.length === 0) {
    return []
  }
  const rows = yield* listSearchRows(scope)
  const scored: ScoredRow[] = []
  const misses: MessageSearchRow[] = []
  for (const row of rows) {
    const score = scoreTerms(headerFields(row), terms)
    if (score === undefined) {
      misses.push(row)
    } else {
      scored.push({ row, score })
    }
  }
  const withBodies = misses.filter((row) => row.bodyFetchedAt !== null)
  if (withBodies.length > 0) {
    const bodies = yield* listMessageBodies(withBodies.map((row) => row.id))
    for (const row of misses) {
      const text = bodies.get(row.id)
      if (text === undefined || text === null) {
        continue
      }
      const score = scoreTerms([{ text, weight: 0.5 }], terms)
      if (score !== undefined) {
        scored.push({ row, score })
      }
    }
  }
  const matched = new Set(scored.map((entry) => entry.row.id))
  const remoteOnly: ScoredRow[] = []
  for (const row of rows) {
    if (matched.has(row.id) || !hits.has(messageIdentity(row))) {
      continue
    }
    remoteOnly.push({ row, score: 0 })
  }
  return [...scored, ...remoteOnly].toSorted(byRank)
})

export { matchRows, queryTerms, toListItem }
