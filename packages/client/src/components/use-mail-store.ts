import type { AppConfig } from "@vingroto/core/config/schema"
import type { MailboxId, MessageId } from "@vingroto/core/ids"
import type { ServerEvent, SyncEvent } from "@vingroto/core/protocol/events"
import type { Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

import { AccountId } from "@vingroto/core/ids"
import { describeSyncEvent } from "@vingroto/core/protocol/events"
import { Effect } from "effect"
import { createEffect, createMemo, createSignal, untrack } from "solid-js"

import type { MailClientError } from "@/lib/api"
import type { MailboxTreeRow } from "@/lib/mail/mailbox-tree"
import type { AppRuntime } from "@/lib/runtime"

import { useMailboxMute } from "@/components/use-mailbox-mute"
import { useMessageActions } from "@/components/use-message-actions"
import { useMessagePane } from "@/components/use-message-pane"
import { useServerEvents } from "@/components/use-server-events"
import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"
import {
  buildMailboxTreeRows,
  createInitialRowKeySelector,
  parseListKey,
  rowKeyAfterMove,
} from "@/lib/mail/mailbox-tree"
import { reconcileRows } from "@/lib/rows"

interface MailStoreOptions {
  readonly runtime: AppRuntime
  readonly config: () => AppConfig | undefined
  readonly connected: () => boolean
  readonly onStatus: (status: string) => void
  readonly onDisconnected: (message: string) => void
  readonly onConfigChanged: () => void
  readonly onNewMail: (mailbox: Mailbox) => void
}

const withoutId = (current: ReadonlySet<MailboxId>, id: MailboxId) =>
  new Set([...current].filter((entry) => entry !== id))

const useMailStore = (options: MailStoreOptions) => {
  const [mailboxes, setMailboxes] = createSignal<readonly Mailbox[]>([])
  const [counts, setCounts] = createSignal<ReadonlyMap<MailboxId, MailboxCounts>>(new Map())
  const [unread, setUnread] = createSignal(0)
  const [selectedListKey, setSelectedListKey] = createSignal<string | undefined>()
  const [collapsedAccounts, setCollapsedAccounts] = createSignal<ReadonlySet<AccountId>>(new Set())
  const [loadingMailboxes, setLoadingMailboxes] = createSignal(false)
  const [syncingMailboxIds, setSyncingMailboxIds] = createSignal<ReadonlySet<MailboxId>>(new Set())
  let mailboxLoadToken = 0

  const visibleMailboxes = createMemo(() => mailboxes().filter((row) => row.selectable))

  const mailboxTreeRows = createMemo<readonly MailboxTreeRow[]>(
    (previous) =>
      reconcileRows(
        previous,
        buildMailboxTreeRows({
          accounts: options.config()?.accounts ?? [],
          mailboxes: visibleMailboxes(),
          counts: counts(),
          unread: unread(),
          collapsed: collapsedAccounts(),
        }),
        (row) => row.key,
      ),
    [],
  )

  const selectedMailboxTreeRow = createMemo(() =>
    mailboxTreeRows().find((row) => row.key === selectedListKey()),
  )

  const selectedMailbox = createMemo((): Mailbox | undefined => {
    const target = parseListKey(selectedListKey())
    if (target === undefined || target.kind !== "mailbox") {
      return undefined
    }
    return visibleMailboxes().find((row) => row.id === target.mailboxId)
  })

  const reportFailure = (label: string, error: MailClientError) => {
    const failure = describeClientFailure(error)
    if (failure._tag === "connection") {
      options.onDisconnected(failure.message)
      return
    }
    options.onStatus(`${label} · ${failure.message}`)
  }

  const messagePane = useMessagePane({
    listKey: selectedListKey,
    onDisconnected: options.onDisconnected,
    onStatus: options.onStatus,
    runtime: options.runtime,
  })

  const selectInitialKey = createInitialRowKeySelector()
  const selectInitialRow = () => {
    setSelectedListKey(selectInitialKey(mailboxTreeRows(), selectedListKey()))
  }

  const loadMailboxData = () => {
    untrack(() => {
      mailboxLoadToken += 1
      const token = mailboxLoadToken
      setLoadingMailboxes(true)
      const program = Effect.gen(function* loadMailboxTreeRows() {
        yield* Effect.gen(function* queryMailboxTreeRows() {
          const client = yield* MailClient
          const snapshot = yield* client.mailboxSnapshot()
          yield* Effect.sync(() => {
            setMailboxes(snapshot.mailboxes)
            const next = new Map<MailboxId, MailboxCounts>()
            for (const entry of snapshot.counts) {
              next.set(entry.mailboxId, entry.counts)
            }
            setCounts(next)
            setUnread(snapshot.unread)
            selectInitialRow()
          })
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              reportFailure("could not load the mailboxes", error)
            }),
          ),
        )
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (mailboxLoadToken === token) {
              setLoadingMailboxes(false)
            }
          }),
        ),
      )
      options.runtime.runFork(program)
    })
  }

  const messageActions = useMessageActions({
    onChanged: (ids: readonly MessageId[]) => {
      messagePane.dropRetained(ids)
      loadMailboxData()
      messagePane.reloadCurrent()
      messagePane.clearMarks()
    },
    onDisconnected: options.onDisconnected,
    onStatus: options.onStatus,
    runtime: options.runtime,
    selectedMessage: messagePane.selectedMessage,
    markedMessages: messagePane.markedMessages,
  })

  const mailboxMute = useMailboxMute({
    runtime: options.runtime,
    onStatus: options.onStatus,
    onChanged: loadMailboxData,
    onDisconnected: options.onDisconnected,
  })

  const toggleMailboxMuted = () => {
    const mailbox = selectedMailbox()
    if (mailbox === undefined) {
      options.onStatus("select a mailbox to mute")
      return
    }
    mailboxMute.toggleMute(mailbox.id, mailbox.name, mailbox.muted)
  }

  const moveRowSelection = (delta: number) => {
    const key = rowKeyAfterMove(mailboxTreeRows(), selectedListKey(), delta)
    if (key !== undefined) {
      setSelectedListKey(key)
    }
  }

  const toggleAccountRow = (key: string) => {
    const accountId = AccountId.make(key.slice("account:".length))
    setCollapsedAccounts((current) => {
      const next = new Set(current)
      if (next.has(accountId)) {
        next.delete(accountId)
      } else {
        next.add(accountId)
      }
      return next
    })
    setSelectedListKey(key)
  }

  const mailboxIdFor = (accountId: AccountId, path: string) =>
    mailboxes().find((row) => row.account_id === accountId && row.path === path)?.id

  const applySyncEvent = (event: SyncEvent) => {
    untrack(() => {
      options.onStatus(describeSyncEvent(event))
      if (event._tag === "mailbox-start") {
        const id = mailboxIdFor(event.accountId, event.path)
        if (id !== undefined) {
          setSyncingMailboxIds((current) => new Set(current).add(id))
        }
        return
      }
      if (event._tag === "sync-error") {
        setSyncingMailboxIds(new Set<MailboxId>())
      } else {
        const id = mailboxIdFor(event.accountId, event.path)
        setSyncingMailboxIds((current) => (id === undefined ? current : withoutId(current, id)))
      }
      if (event._tag === "mailbox-done" && event.stored > 0) {
        const mailbox = mailboxes().find(
          (row) => row.account_id === event.accountId && row.path === event.path,
        )
        if (mailbox !== undefined) {
          options.onNewMail(mailbox)
        }
      }
      loadMailboxData()
      const target = parseListKey(selectedListKey())
      if (target === undefined) {
        return
      }
      if (target.kind === "mailbox") {
        const mailbox = visibleMailboxes().find((row) => row.id === target.mailboxId)
        if (
          event._tag === "mailbox-done" &&
          mailbox !== undefined &&
          event.accountId === mailbox.account_id &&
          event.path === mailbox.path
        ) {
          messagePane.reloadCurrent()
        }
        return
      }
      if (event._tag === "mailbox-done") {
        messagePane.reloadCurrent()
      }
    })
  }

  const applyEvent = (event: ServerEvent) => {
    if (event._tag === "data-changed") {
      loadMailboxData()
      messagePane.reloadCurrent()
      return
    }
    if (event._tag === "config-changed") {
      options.onConfigChanged()
      return
    }
    applySyncEvent(event)
  }

  createEffect(() => {
    if (options.config() === undefined) {
      return
    }
    loadMailboxData()
  })

  useServerEvents({
    enabled: options.connected,
    onDisconnected: options.onDisconnected,
    onEvent: applyEvent,
    runtime: options.runtime,
  })

  return {
    ...messagePane,
    ...messageActions,
    counts,
    mailboxTreeRows,
    loadingMailboxes,
    mailboxes,
    mutingMailboxIds: mailboxMute.mutingIds,
    selectedListKey,
    selectedMailboxTreeRow,
    selectedMailbox,
    syncingMailboxIds,
    unread,
    visibleMailboxes,
    loadMailboxData,
    moveRowSelection,
    toggleAccountRow,
    toggleMailboxMuted,
  }
}
type MailStore = ReturnType<typeof useMailStore>

export { useMailStore, type MailStore, type MailStoreOptions }
