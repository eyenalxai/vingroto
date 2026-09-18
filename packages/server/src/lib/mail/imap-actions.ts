import type { AccountConfig } from "@vingroto/core/config/schema"
import type { ImapFlow } from "imapflow"

import * as Effect from "effect/Effect"

import type { FlagMode } from "@/lib/mail/imap-types"

import { commandTimeout, guard, withMailboxLock } from "@/lib/mail/imap-command"
import { ImapError } from "@/lib/mail/imap-types"

const requireAccepted = (account: AccountConfig, operation: string, accepted: boolean) => {
  if (accepted) {
    return Effect.void
  }
  return Effect.fail(
    new ImapError({
      accountId: account.id,
      operation,
      message: "the server rejected the command",
    }),
  )
}

const updateFlags = (
  client: ImapFlow,
  account: AccountConfig,
  mailboxPath: string,
  uids: readonly number[],
  flags: readonly string[],
  mode: FlagMode,
) =>
  withMailboxLock(
    client,
    account,
    mailboxPath,
    false,
    Effect.gen(function* updateMessageFlags() {
      if (uids.length === 0) {
        return
      }
      const operation = `${mode === "add" ? "add" : "remove"} flags on ${mailboxPath}`
      const accepted = yield* guard(account, operation, commandTimeout, async () =>
        mode === "add"
          ? client.messageFlagsAdd([...uids], [...flags], { uid: true })
          : client.messageFlagsRemove([...uids], [...flags], { uid: true }),
      )
      yield* requireAccepted(account, operation, accepted)
    }),
  )

const moveMessages = (
  client: ImapFlow,
  account: AccountConfig,
  sourcePath: string,
  uids: readonly number[],
  targetPath: string,
) =>
  withMailboxLock(
    client,
    account,
    sourcePath,
    false,
    Effect.gen(function* moveToTarget() {
      if (uids.length === 0) {
        return
      }
      const operation = `move ${uids.length} message(s) from ${sourcePath} to ${targetPath}`
      const accepted = yield* guard(account, operation, commandTimeout, async () =>
        client.messageMove([...uids], targetPath, { uid: true }),
      )
      yield* requireAccepted(account, operation, accepted !== false)
    }),
  )

export { moveMessages, updateFlags }
