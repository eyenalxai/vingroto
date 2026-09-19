import type { MailboxId } from "@vingroto/core/ids"

import * as Effect from "effect/Effect"

import { ServerEvents } from "@/lib/events"
import { listMailboxes, setMailboxMuted } from "@/lib/store/mailboxes"
import { unreadMessageCounts } from "@/lib/store/message-views"
import { messageCounts } from "@/lib/store/messages"

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
  yield* setMailboxMuted(mailboxId, muted)
  yield* events.publish({ _tag: "data-changed" })
})

export { readMailboxSnapshot, updateMailboxMute }
