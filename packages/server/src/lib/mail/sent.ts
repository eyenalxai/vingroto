import type { AccountConfig } from "@vingroto/core/config/schema"
import type { Uid } from "@vingroto/core/ids"
import type { OutgoingMessage } from "@vingroto/core/protocol/outgoing"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { AccountId } from "@vingroto/core/ids"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type { MessageEnvelope } from "@/lib/mail/imap-types"
import type { SmtpError } from "@/lib/mail/mailer"
import type { MailboxRow } from "@/lib/store/mailboxes"

import { Database } from "@/lib/db/database"
import { ServerEvents } from "@/lib/events"
import { Imap } from "@/lib/mail/imap"
import { Mailer } from "@/lib/mail/mailer"
import { storeMessageBody } from "@/lib/store/bodies"
import { listAccountMailboxes } from "@/lib/store/mailboxes"
import { getMessageIdByUid, storeMessages } from "@/lib/store/messages"

const sentSpecialUse = String.raw`\Sent`
const seenFlag = String.raw`\Seen`

class SentMailboxMissing extends Schema.TaggedError<SentMailboxMissing>()("SentMailboxMissing", {
  accountId: AccountId,
  message: Schema.String,
}) {}

class SentCopyAppendFailed extends Schema.TaggedError<SentCopyAppendFailed>()(
  "SentCopyAppendFailed",
  {
    accountId: AccountId,
    mailboxPath: Schema.String,
    message: Schema.String,
  },
) {}

type SentCopyError = SentMailboxMissing | SentCopyAppendFailed | EffectDrizzleQueryError | SmtpError

interface SentCopiesShape {
  readonly save: (
    account: AccountConfig,
    message: OutgoingMessage,
  ) => Effect.Effect<void, SentCopyError>
}

const toEnvelope = (
  account: AccountConfig,
  message: OutgoingMessage,
  uid: Uid,
  raw: Buffer,
  now: number,
): MessageEnvelope => {
  return {
    uid,
    messageId: undefined,
    inReplyTo: message.inReplyTo,
    subject: message.subject,
    from: [
      account.name === undefined || account.name.trim().length === 0
        ? { address: account.email }
        : { name: account.name, address: account.email },
    ],
    to: message.to,
    cc: message.cc,
    date: now,
    size: raw.length,
    seen: true,
    answered: false,
    flagged: false,
    draft: false,
    keywords: [],
  }
}

const toAppendFailure = (account: AccountConfig, mailboxPath: string, message: string) =>
  new SentCopyAppendFailed({ accountId: account.id, mailboxPath, message })

const logUncachedCopy = (account: AccountConfig, mailboxPath: string, reason: string) =>
  Effect.logWarning("sent copy was not cached").pipe(
    Effect.annotateLogs({ account: account.id, mailbox: mailboxPath, reason }),
  )

const warnSentCopy = (account: AccountConfig, reason: string, mailboxPath?: string) =>
  Effect.logWarning("sent copy was not saved").pipe(
    Effect.annotateLogs({
      account: account.id,
      ...(mailboxPath === undefined ? {} : { mailbox: mailboxPath }),
      reason,
    }),
  )

class SentCopies extends Context.Service<SentCopies, SentCopiesShape>()(
  "@vingroto/server/lib/mail/sent/SentCopies",
) {
  static readonly layer = Layer.effect(
    SentCopies,
    Effect.gen(function* makeSentCopies() {
      const database = yield* Database
      const imap = yield* Imap
      const mailer = yield* Mailer
      const events = yield* ServerEvents

      const cacheCopy = Effect.fnUntraced(function* cacheCopy(
        account: AccountConfig,
        message: OutgoingMessage,
        mailbox: MailboxRow,
        uid: Uid,
        raw: Buffer,
      ) {
        const now = yield* Clock.currentTimeMillis
        yield* storeMessages({
          accountId: account.id,
          mailboxId: mailbox.id,
          envelopes: [toEnvelope(account, message, uid, raw, now)],
        })
        const messageId = yield* getMessageIdByUid(mailbox.id, uid)
        if (messageId !== undefined) {
          yield* storeMessageBody(messageId, { text: message.body, html: null }, false)
        }
        yield* events.publish({ _tag: "data-changed" })
      })

      const save = Effect.fn("SentCopies.save")(
        function* saveCopy(account: AccountConfig, message: OutgoingMessage) {
          if (!account.saveSent) {
            return yield* Effect.void
          }
          const mailboxes = yield* listAccountMailboxes(account.id)
          const mailbox = mailboxes.find((row) => row.special_use === sentSpecialUse)
          if (mailbox === undefined) {
            return yield* new SentMailboxMissing({
              accountId: account.id,
              message: `account ${account.id} has no Sent mailbox`,
            })
          }
          const raw = yield* mailer.compile(account, message)
          const uid = yield* imap.appendMessage(account, mailbox.path, raw, [seenFlag]).pipe(
            Effect.catchTags({
              ImapError: (error) =>
                Effect.fail(toAppendFailure(account, mailbox.path, error.message)),
              KeyringError: (error) =>
                Effect.fail(
                  toAppendFailure(
                    account,
                    mailbox.path,
                    `keyring ${error.operation} failed: ${error.message}`,
                  ),
                ),
              CredentialNotFound: (error) =>
                Effect.fail(toAppendFailure(account, mailbox.path, error.message)),
            }),
          )
          if (uid === undefined) {
            return yield* logUncachedCopy(
              account,
              mailbox.path,
              "the server did not return the appended message's uid",
            )
          }
          return yield* cacheCopy(account, message, mailbox, uid, raw).pipe(
            Effect.catchTags({
              EffectDrizzleQueryError: (error) =>
                logUncachedCopy(account, mailbox.path, error.message),
              SqlError: (error) => logUncachedCopy(account, mailbox.path, error.message),
            }),
          )
        },
        Effect.provideService(Database, database),
      )

      return SentCopies.of({ save })
    }),
  )
}

export {
  SentCopies,
  SentCopyAppendFailed,
  SentMailboxMissing,
  warnSentCopy,
  type SentCopiesShape,
  type SentCopyError,
}
