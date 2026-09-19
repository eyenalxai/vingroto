import type { AccountId, MailboxId } from "@vingroto/core/ids"
import type { ListScope } from "@vingroto/core/protocol/mail"

import { InvalidRequestError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"

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
    ? Effect.fail(new InvalidRequestError({ field: "limit", message: "limit is required" }))
    : Effect.succeed(query.limit)

const scopeFromQuery = (query: ListScopeQuery): Effect.Effect<ListScope, InvalidRequestError> => {
  if (query.scope === undefined) {
    return Effect.fail(new InvalidRequestError({ field: "scope", message: "scope is required" }))
  }
  if (query.scope === "mailbox") {
    if (query.mailboxId === undefined) {
      return Effect.fail(
        new InvalidRequestError({
          field: "mailboxId",
          message: "mailboxId is required when the scope is mailbox",
        }),
      )
    }
    return Effect.succeed({ kind: "mailbox", mailboxId: query.mailboxId })
  }
  if (query.mailboxId !== undefined) {
    return Effect.fail(
      new InvalidRequestError({
        field: "mailboxId",
        message: "mailboxId is only valid when the scope is mailbox",
      }),
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
      new InvalidRequestError({
        field: "accountId",
        message: "accountId is only valid when the scope is unread",
      }),
    )
  }
  return Effect.succeed({ kind: "all" })
}

export { limitFromQuery, scopeFromQuery, type ListLimitQuery, type ListScopeQuery }
