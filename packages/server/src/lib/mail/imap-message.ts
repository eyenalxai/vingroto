import type { AccountConfig } from "@vingroto/core/config/schema"
import type { Uid } from "@vingroto/core/ids"
import type { ImapFlow } from "imapflow"

import * as Effect from "effect/Effect"

import type { MessageSourceRequest, MessageSourceResult } from "@/lib/mail/imap-types"

import { commandTimeout, guard, withMailboxLock } from "@/lib/mail/imap-command"
import { ImapError, messageSourceResult } from "@/lib/mail/imap-types"

const maxSourceBytes = 32 * 1024 * 1024

interface MailboxSourceRequests {
  readonly mailboxPath: string
  readonly uids: readonly Uid[]
}

const readSource = Effect.fn("Imap.readSource")(function* fetchSource(
  client: ImapFlow,
  account: AccountConfig,
  mailboxPath: string,
  uid: Uid,
) {
  const message = yield* guard(account, `fetch message ${uid}`, commandTimeout, async () =>
    client.fetchOne(uid, { source: true }, { uid: true }),
  )
  if (message === false || message === undefined || message.source === undefined) {
    return yield* new ImapError({
      accountId: account.id,
      operation: `fetch message ${uid}`,
      message: `message ${uid} could not be read from ${mailboxPath}`,
    })
  }
  if (message.source.length > maxSourceBytes) {
    const limit = Math.round(maxSourceBytes / (1024 * 1024))
    return yield* new ImapError({
      accountId: account.id,
      operation: `fetch message ${uid}`,
      message: `message ${uid} is larger than ${limit} MB`,
    })
  }
  return message.source
})

const readMailboxSources = (
  client: ImapFlow,
  account: AccountConfig,
  mailboxPath: string,
  uids: readonly Uid[],
) =>
  withMailboxLock(
    client,
    account,
    mailboxPath,
    true,
    Effect.gen(function* readMessageSources() {
      const sources: MessageSourceResult[] = []
      for (const uid of uids) {
        const result = yield* readSource(client, account, mailboxPath, uid).pipe(
          Effect.map((source): MessageSourceResult =>
            messageSourceResult.ok({ mailboxPath, uid, source }),
          ),
          Effect.catch((error) =>
            Effect.succeed<MessageSourceResult>(
              messageSourceResult.error({ mailboxPath, uid, message: error.message }),
            ),
          ),
        )
        sources.push(result)
      }
      return sources
    }),
  )

const readMessageSource = (
  client: ImapFlow,
  account: AccountConfig,
  mailboxPath: string,
  uid: Uid,
) =>
  withMailboxLock(client, account, mailboxPath, true, readSource(client, account, mailboxPath, uid))

const groupRequestsByMailbox = (
  requests: readonly MessageSourceRequest[],
): readonly MailboxSourceRequests[] => {
  const groups = new Map<string, Uid[]>()
  for (const request of requests) {
    const uids = groups.get(request.mailboxPath)
    if (uids === undefined) {
      groups.set(request.mailboxPath, [request.uid])
      continue
    }
    uids.push(request.uid)
  }
  return [...groups].map(([mailboxPath, uids]) => {
    return { mailboxPath, uids }
  })
}

export { groupRequestsByMailbox, readMailboxSources, readMessageSource }
