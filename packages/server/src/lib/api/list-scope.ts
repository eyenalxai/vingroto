import type { AccountId, MailboxId } from "@vingroto/core/ids"
import type { InvalidRequestError } from "@vingroto/core/protocol/api/errors"
import type { ListScope } from "@vingroto/core/protocol/mail"

import * as Effect from "effect/Effect"

import { invalidField } from "@/lib/api/invalid-request"

interface ListScopeQuery {
  readonly scope?: "all" | "unread" | "mailbox" | undefined
  readonly accountId?: AccountId | undefined
  readonly mailboxId?: MailboxId | undefined
}

interface ListLimitQuery {
  readonly limit?: number | undefined
}

const limitFromQuery = (query: ListLimitQuery): Effect.Effect<number, InvalidRequestError> =>
  query.limit === undefined
    ? Effect.fail(invalidField("Query", "limit", "limit is required"))
    : Effect.succeed(query.limit)

const scopeFromQuery = (query: ListScopeQuery): Effect.Effect<ListScope, InvalidRequestError> => {
  if (query.scope === undefined) {
    return Effect.fail(invalidField("Query", "scope", "scope is required"))
  }
  if (query.scope === "mailbox") {
    if (query.mailboxId === undefined) {
      return Effect.fail(
        invalidField("Query", "mailboxId", "mailboxId is required when the scope is mailbox"),
      )
    }
    return Effect.succeed({ kind: "mailbox", mailboxId: query.mailboxId })
  }
  if (query.mailboxId !== undefined) {
    return Effect.fail(
      invalidField("Query", "mailboxId", "mailboxId is only valid when the scope is mailbox"),
    )
  }
  if (query.scope === "unread") {
    return Effect.succeed(
      query.accountId === undefined
        ? { kind: "unread" }
        : { kind: "unread", accountId: query.accountId },
    )
  }
  if (query.accountId !== undefined) {
    return Effect.fail(
      invalidField("Query", "accountId", "accountId is only valid when the scope is unread"),
    )
  }
  return Effect.succeed({ kind: "all" })
}

export { limitFromQuery, scopeFromQuery, type ListLimitQuery, type ListScopeQuery }
