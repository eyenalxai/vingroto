import type { AccountConfig } from "@vingroto/core/config/schema"
import type { Mailbox } from "@vingroto/core/protocol/mail"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import type { SqlError } from "effect/unstable/sql/SqlError"

import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"

import type { Database } from "@/lib/db/database"
import type { ImapShape } from "@/lib/mail/imap"
import type { ImapServiceError } from "@/lib/mail/imap-types"

import { applyMessageFlags, listMessageUids } from "@/lib/store/message-flags"

interface FlagSyncFailure {
  readonly path: string
  readonly message: string
}

const reconcileMailboxFlags = Effect.fn("Sync.reconcileMailboxFlags")(
  function* reconcileMailboxFlags(
    imap: ImapShape,
    account: AccountConfig,
    mailboxes: readonly Mailbox[],
  ): Effect.fn.Return<
    readonly FlagSyncFailure[],
    ImapServiceError | EffectDrizzleQueryError | SqlError,
    Database
  > {
    const idByPath = new Map(mailboxes.map((row) => [row.path, row.id]))
    const requests = yield* Effect.forEach(
      mailboxes,
      (row) => listMessageUids(row.id).pipe(Effect.map((uids) => ({ path: row.path, uids }))),
      { concurrency: 1 },
    )
    const failures: FlagSyncFailure[] = []
    yield* imap.fetchMessageFlags(account, requests).pipe(
      Stream.runForEach((result) =>
        Effect.gen(function* reconcileResult() {
          if (result._tag === "error") {
            failures.push({ path: result.path, message: result.message })
            return
          }
          const mailboxId = idByPath.get(result.path)
          if (mailboxId === undefined) {
            return
          }
          const updated = yield* applyMessageFlags({ mailboxId, flags: result.flags })
          if (updated > 0) {
            yield* Effect.logInfo("mailbox flags reconciled").pipe(
              Effect.annotateLogs({ account: account.id, mailbox: result.path, updated }),
            )
          }
        }),
      ),
    )
    return failures
  },
)

export { reconcileMailboxFlags, type FlagSyncFailure }
