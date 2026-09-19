import { MailboxId } from "@vingroto/core/ids"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { ServerEvents } from "@/lib/events"
import { getMailbox, listMailboxes, setMailboxMuted } from "@/lib/store/mailboxes"
import { unreadMessageCounts } from "@/lib/store/message-views"
import { messageCounts } from "@/lib/store/messages"

class MailboxNotFound extends Schema.TaggedError<MailboxNotFound>()("MailboxNotFound", {
  mailboxId: MailboxId,
  message: Schema.String,
}) {}

const readMailboxSnapshot = Effect.fn("Mailbox.snapshot")(function* readMailboxSnapshot() {
  const mailboxes = yield* listMailboxes()
  const counts = yield* messageCounts()
  const { total, byAccount } = yield* unreadMessageCounts()
  return {
    mailboxes,
    counts: Array.from(counts, ([mailboxId, mailboxCounts]) => {
      return { mailboxId, counts: mailboxCounts }
    }),
    unread: total,
    accountUnread: Array.from(byAccount, ([accountId, accountUnread]) => {
      return { accountId, unread: accountUnread }
    }),
  }
})

const updateMailboxMute = Effect.fn("Mailbox.updateMute")(function* updateMailboxMute(
  mailboxId: MailboxId,
  muted: boolean,
) {
  const events = yield* ServerEvents
  const mailbox = yield* getMailbox(mailboxId)
  if (mailbox === undefined) {
    return yield* new MailboxNotFound({
      mailboxId,
      message: `mailbox ${mailboxId} was not found`,
    })
  }
  yield* setMailboxMuted(mailboxId, muted)
  return yield* events.publish({ _tag: "data-changed" })
})

export { MailboxNotFound, readMailboxSnapshot, updateMailboxMute }
