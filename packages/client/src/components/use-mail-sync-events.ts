import type { MailboxId } from "@vingroto/core/ids"
import type { NewestUnseen, SyncEvent } from "@vingroto/core/protocol/events"
import type { Mailbox } from "@vingroto/core/protocol/mail"

import { describeSyncEvent } from "@vingroto/core/protocol/events"
import { createSignal, untrack } from "solid-js"

import { findMailboxId, listHasMailbox, parseListKey } from "@/lib/mail/mailbox-tree"

type NewMailListener = (mailbox: Mailbox, newestUnseen: NewestUnseen, visible: boolean) => void

interface MailSyncEventsOptions {
  readonly mailboxes: () => readonly Mailbox[]
  readonly visibleMailboxes: () => readonly Mailbox[]
  readonly selectedListKey: () => string | undefined
  readonly searchActive: () => boolean
  readonly onStatus: (status: string) => void
  readonly onNewMail: NewMailListener
  readonly onMailboxesChanged: () => void
  readonly onReloadCurrent: () => void
}

const useMailSyncEvents = (options: MailSyncEventsOptions) => {
  const [syncingMailboxIds, setSyncingMailboxIds] = createSignal<ReadonlySet<MailboxId>>(new Set())

  const applySyncEvent = (event: SyncEvent) => {
    untrack(() => {
      options.onStatus(describeSyncEvent(event))
      if (event._tag === "mailbox-start") {
        const id = findMailboxId(options.mailboxes(), event.accountId, event.path)
        if (id !== undefined) {
          setSyncingMailboxIds((current) => new Set(current).add(id))
        }
        return
      }
      if (event._tag === "sync-error") {
        setSyncingMailboxIds(new Set<MailboxId>())
      } else {
        const id = findMailboxId(options.mailboxes(), event.accountId, event.path)
        setSyncingMailboxIds((current) =>
          id === undefined ? current : new Set([...current].filter((entry) => entry !== id)),
        )
      }
      const target = parseListKey(options.selectedListKey())
      if (event._tag === "mailbox-done" && event.newestUnseen !== null) {
        const mailbox = options
          .mailboxes()
          .find((row) => row.accountId === event.accountId && row.path === event.path)
        if (mailbox !== undefined) {
          options.onNewMail(
            mailbox,
            event.newestUnseen,
            listHasMailbox(target, options.searchActive(), mailbox),
          )
        }
      }
      options.onMailboxesChanged()
      if (target === undefined) {
        return
      }
      if (target.kind === "mailbox") {
        const mailbox = options.visibleMailboxes().find((row) => row.id === target.mailboxId)
        if (
          event._tag === "mailbox-done" &&
          mailbox !== undefined &&
          event.accountId === mailbox.accountId &&
          event.path === mailbox.path
        ) {
          options.onReloadCurrent()
        }
        return
      }
      if (event._tag === "mailbox-done") {
        options.onReloadCurrent()
      }
    })
  }

  return { applySyncEvent, syncingMailboxIds }
}

export { useMailSyncEvents, type MailSyncEventsOptions, type NewMailListener }
