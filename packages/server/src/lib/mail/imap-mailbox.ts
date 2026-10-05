import type { AccountConfig } from "@vingroto/core/config/schema"
import type { FetchQueryObject, ImapFlow } from "imapflow"

import { Uid } from "@vingroto/core/ids"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"

import type {
  MailboxFlagsRequest,
  MailboxFlagsResult,
  MailboxSnapshot,
  MailboxWindowRequest,
  MailboxWindowResult,
  MessageEnvelope,
  MessageFlags,
} from "@/lib/mail/imap-types"

import { commandTimeout, guardRead, withMailboxLock } from "@/lib/mail/imap-command"
import { toMessageEnvelope, toMessageFlags } from "@/lib/mail/imap-mapping"
import { ImapError, mailboxFlagsResult, mailboxWindowResult } from "@/lib/mail/imap-types"

const fetchBatchSize = 200

const envelopeQuery: FetchQueryObject = {
  uid: true,
  envelope: true,
  flags: true,
  size: true,
  internalDate: true,
}

const collectUids = Effect.fn("Imap.collectUids")(function* collectMailboxUids(
  client: ImapFlow,
  account: AccountConfig,
  request: MailboxWindowRequest,
  uidNext: number,
) {
  const fromUid = request.fromUid
  if (fromUid !== undefined) {
    if (fromUid >= uidNext) {
      return []
    }
    const found = yield* guardRead(account, `search ${request.path}`, commandTimeout, () =>
      client.search({ uid: `${fromUid}:*` }, { uid: true }),
    )
    const uids = found === false || found === undefined ? [] : found
    return uids.filter((uid) => uid >= fromUid).map((uid) => Uid.make(uid))
  }
  const since = request.since
  if (since === undefined) {
    return []
  }
  const found = yield* guardRead(account, `search ${request.path}`, commandTimeout, () =>
    client.search({ since: DateTime.toDateUtc(since) }, { uid: true }),
  )
  return found === false || found === undefined ? [] : found.map((uid) => Uid.make(uid))
})

const fetchEnvelopes = Effect.fn("Imap.fetchEnvelopes")(function* fetchMessageEnvelopes(
  client: ImapFlow,
  account: AccountConfig,
  uids: readonly Uid[],
) {
  const messages: MessageEnvelope[] = []
  for (let index = 0; index < uids.length; index += fetchBatchSize) {
    const batch = uids.slice(index, index + fetchBatchSize)
    const fetched = yield* guardRead(account, "fetch envelopes", commandTimeout, () =>
      Array.fromAsync(client.fetch(batch, envelopeQuery, { uid: true })),
    )
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

const fetchMailboxResult = Effect.fn("Imap.fetchMailboxWindow")(function* resolveMailboxWindow(
  client: ImapFlow,
  account: AccountConfig,
  request: MailboxWindowRequest,
) {
  const outcome = yield* fetchMailbox(client, account, request).pipe(
    Effect.map((snapshot): MailboxWindowResult =>
      mailboxWindowResult.ok({ path: request.path, snapshot }),
    ),
    Effect.catch((error) =>
      Effect.succeed<MailboxWindowResult>(
        mailboxWindowResult.error({ path: request.path, message: error.message }),
      ),
    ),
  )
  return outcome
})

const flagsQuery: FetchQueryObject = {
  uid: true,
  flags: true,
}

const fetchMailboxFlags = (
  client: ImapFlow,
  account: AccountConfig,
  request: MailboxFlagsRequest,
) =>
  withMailboxLock(
    client,
    account,
    request.path,
    true,
    Effect.gen(function* readMailboxFlags() {
      const mailbox = client.mailbox
      if (mailbox === false) {
        return yield* new ImapError({
          accountId: account.id,
          operation: `select ${request.path}`,
          message: "the mailbox could not be opened",
        })
      }
      const flags: MessageFlags[] = []
      for (let index = 0; index < request.uids.length; index += fetchBatchSize) {
        const batch = request.uids.slice(index, index + fetchBatchSize)
        const fetched = yield* guardRead(account, "fetch flags", commandTimeout, () =>
          Array.fromAsync(client.fetch(batch, flagsQuery, { uid: true })),
        )
        for (const message of fetched) {
          flags.push(toMessageFlags(message))
        }
      }
      return flags
    }),
  )

const fetchMailboxFlagsResult = Effect.fn("Imap.fetchMailboxFlags")(function* resolveMailboxFlags(
  client: ImapFlow,
  account: AccountConfig,
  request: MailboxFlagsRequest,
) {
  const outcome = yield* fetchMailboxFlags(client, account, request).pipe(
    Effect.map((flags): MailboxFlagsResult => mailboxFlagsResult.ok({ path: request.path, flags })),
    Effect.catch((error) =>
      Effect.succeed<MailboxFlagsResult>(
        mailboxFlagsResult.error({ path: request.path, message: error.message }),
      ),
    ),
  )
  return outcome
})

export { fetchEnvelopes, fetchMailboxFlagsResult, fetchMailboxResult }
