import * as Effect from "effect/Effect"

import { ServerEvents } from "@/lib/events"
import { listMailboxes, setMailboxMuted } from "@/lib/store/mailboxes"
import { messageCounts, unreadMessageCount } from "@/lib/store/messages"

const readFolderSnapshot = Effect.fn("Folder.snapshot")(function* readFolderSnapshot() {
  const mailboxes = yield* listMailboxes()
  const counts = yield* messageCounts()
  const unread = yield* unreadMessageCount()
  return {
    mailboxes,
    counts: Array.from(counts, ([mailboxId, mailboxCounts]) => {
      return { mailboxId, counts: mailboxCounts }
    }),
    unread,
  }
})

const setFolderMuted = Effect.fn("Folder.setMuted")(function* setFolderMuted(
  mailboxId: number,
  muted: boolean,
) {
  const events = yield* ServerEvents
  yield* setMailboxMuted(mailboxId, muted)
  yield* events.publish({ _tag: "data-changed" })
})

export { readFolderSnapshot, setFolderMuted }
