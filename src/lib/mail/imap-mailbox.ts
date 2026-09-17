import type { FetchMessageObject, FetchQueryObject, ImapFlow } from "imapflow"

import * as Effect from "effect/Effect"

import type { AccountConfig } from "@/lib/config/schema"
import type {
  MailboxSnapshot,
  MailboxWindowRequest,
  MailboxWindowResult,
  MessageEnvelope,
} from "@/lib/mail/imap-types"

import { commandTimeout, guard, withMailboxLock } from "@/lib/mail/imap-command"
import { toMessageEnvelope } from "@/lib/mail/imap-mapping"
import { ImapError } from "@/lib/mail/imap-types"

const fetchBatchSize = 200

const envelopeQuery: FetchQueryObject = {
  uid: true,
  envelope: true,
  flags: true,
  size: true,
  internalDate: true,
}

const collectUids = (
  client: ImapFlow,
  account: AccountConfig,
  request: MailboxWindowRequest,
  uidNext: number,
) =>
  Effect.gen(function* collectMailboxUids() {
    const fromUid = request.fromUid
    if (fromUid !== undefined) {
      if (fromUid >= uidNext) {
        return []
      }
      const found = yield* guard(account, `search ${request.path}`, commandTimeout, async () =>
        client.search({ uid: `${fromUid}:*` }, { uid: true }),
      )
      const uids = found === false || found === undefined ? [] : found
      return uids.filter((uid) => uid >= fromUid)
    }
    const since = request.since
    if (since === undefined) {
      return []
    }
    const found = yield* guard(account, `search ${request.path}`, commandTimeout, async () =>
      client.search({ since }, { uid: true }),
    )
    return found === false || found === undefined ? [] : found
  })

const fetchEnvelopes = (client: ImapFlow, account: AccountConfig, uids: readonly number[]) =>
  Effect.gen(function* fetchMessageEnvelopes() {
    const messages: MessageEnvelope[] = []
    for (let index = 0; index < uids.length; index += fetchBatchSize) {
      const batch = uids.slice(index, index + fetchBatchSize)
      const fetched = yield* guard(account, "fetch envelopes", commandTimeout, async () => {
        const collected: FetchMessageObject[] = []
        for await (const message of client.fetch(batch, envelopeQuery, { uid: true })) {
          collected.push(message)
        }
        return collected
      })
      for (const message of fetched) {
        messages.push(toMessageEnvelope(message))
      }
    }
    return messages
  })

const fetchMailbox = (client: ImapFlow, account: AccountConfig, request: MailboxWindowRequest) =>
  withMailboxLock(
    client,
    account,
    request.path,
    false,
    Effect.gen(function* readMailboxContents() {
      const mailbox = client.mailbox
      if (mailbox === false) {
        return yield* new ImapError({
          accountId: account.id,
          operation: `select ${request.path}`,
          message: "the mailbox could not be opened",
        })
      }
      const uids = yield* collectUids(client, account, request, mailbox.uidNext)
      const messages = yield* fetchEnvelopes(client, account, uids)
      const snapshot: MailboxSnapshot = {
        path: request.path,
        uidValidity: Number(mailbox.uidValidity),
        exists: mailbox.exists,
        messages,
      }
      return snapshot
    }),
  )

const fetchMailboxResult = (
  client: ImapFlow,
  account: AccountConfig,
  request: MailboxWindowRequest,
) =>
  Effect.gen(function* resolveMailboxWindow() {
    const outcome = yield* fetchMailbox(client, account, request).pipe(
      Effect.map((snapshot): MailboxWindowResult => {
        return { _tag: "ok", path: request.path, snapshot }
      }),
      Effect.catch((error) =>
        Effect.succeed<MailboxWindowResult>({
          _tag: "error",
          path: request.path,
          message: error.message,
        }),
      ),
    )
    return outcome
  })

export { fetchMailboxResult }
