import type { AccountConfig } from "@vingroto/core/config/schema"
import type { Uid } from "@vingroto/core/ids"
import type { OutgoingMessage } from "@vingroto/core/protocol/outgoing"

import { describeError } from "@vingroto/core/errors"
import { AccountId } from "@vingroto/core/ids"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type { MessageEnvelope } from "@/lib/mail/imap-types"
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

interface SentCopiesShape {
  readonly save: (account: AccountConfig, message: OutgoingMessage) => Effect.Effect<void>
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

class SentCopies extends Context.Service<SentCopies, SentCopiesShape>()(
  "vingroto/lib/mail/SentCopies",
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
            return
          }
          const outcome = yield* Effect.gen(function* appendCopy() {
            const mailboxes = yield* listAccountMailboxes(account.id)
            const mailbox = mailboxes.find((row) => row.special_use === sentSpecialUse)
            if (mailbox === undefined) {
              yield* new SentMailboxMissing({
                accountId: account.id,
                message: `account ${account.id} has no Sent mailbox`,
              })
              return
            }
            const raw = yield* mailer.compile(account, message)
            const uid = yield* imap.appendMessage(account, mailbox.path, raw, [seenFlag])
            if (uid === undefined) {
              yield* Effect.logWarning("sent copy was not saved").pipe(
                Effect.annotateLogs({
                  account: account.id,
                  mailbox: mailbox.path,
                  reason: "the server did not return the appended message's uid",
                }),
              )
              return
            }
            yield* cacheCopy(account, message, mailbox, uid, raw).pipe(
              Effect.catch((error) =>
                Effect.logWarning("sent copy was not cached").pipe(
                  Effect.annotateLogs({
                    account: account.id,
                    mailbox: mailbox.path,
                    reason: describeError(error),
                  }),
                ),
              ),
            )
          }).pipe(Effect.result)
          if (outcome._tag === "Failure") {
            yield* Effect.logWarning("sent copy was not saved").pipe(
              Effect.annotateLogs({
                account: account.id,
                reason: describeError(outcome.failure),
              }),
            )
          }
        },
        Effect.provideService(Database, database),
      )

      return SentCopies.of({ save })
    }),
  )
}

export { SentCopies, SentMailboxMissing, type SentCopiesShape }
