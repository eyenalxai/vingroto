import type { AppConfig } from "@vingroto/core/config/schema"
import type { MailboxId, MessageId } from "@vingroto/core/ids"
import type { ServerEvent } from "@vingroto/core/protocol/events"
import type { Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

import { AccountId } from "@vingroto/core/ids"
import { Effect } from "effect"
import { createEffect, createMemo, createSignal, untrack } from "solid-js"

import type { NewMailListener } from "@/components/use-mail-sync-events"
import type { MailClientError } from "@/lib/api"
import type { MailboxTreeRow, MailViewKind } from "@/lib/mail/mailbox-tree"
import type { AppRuntime } from "@/lib/runtime"

import { useOutboxView } from "@/components/outbox/use-outbox-view"
import { useMailSyncEvents } from "@/components/use-mail-sync-events"
import { useMailboxMute } from "@/components/use-mailbox-mute"
import { useMessageActions } from "@/components/use-message-actions"
import { useMessagePane } from "@/components/use-message-pane"
import { useServerEvents } from "@/components/use-server-events"
import { MailClient } from "@/lib/api"
import { describeClientFailure, reportDefects } from "@/lib/failure"
import {
  buildMailboxTreeRows,
  createInitialRowKeySelector,
  listKeyForView,
  parseListKey,
  rowKeyAfterMove,
  viewKindOf,
} from "@/lib/mail/mailbox-tree"
import { reconcileRows } from "@/lib/rows"

interface MailStoreOptions {
  readonly runtime: AppRuntime
  readonly config: () => AppConfig | undefined
  readonly connected: () => boolean
  readonly onStatus: (status: string) => void
  readonly onDisconnected: (message: string) => void
  readonly onConfigChanged: () => void
  readonly onNewMail: NewMailListener
}

const useMailStore = (options: MailStoreOptions) => {
  const [mailboxes, setMailboxes] = createSignal<readonly Mailbox[]>([])
  const [counts, setCounts] = createSignal<ReadonlyMap<MailboxId, MailboxCounts>>(new Map())
  const [unread, setUnread] = createSignal(0)
  const [accountUnread, setAccountUnread] = createSignal<ReadonlyMap<AccountId, number>>(new Map())
  const [selectedListKey, setSelectedListKey] = createSignal<string | undefined>()
  const [collapsedAccounts, setCollapsedAccounts] = createSignal<ReadonlySet<AccountId>>(new Set())
  const [loadingMailboxes, setLoadingMailboxes] = createSignal(false)
  let mailboxLoadToken = 0

  const selectedView = createMemo(() => viewKindOf(parseListKey(selectedListKey())))

  const outboxView = useOutboxView({
    enabled: () => options.config() !== undefined,
    onDisconnected: options.onDisconnected,
    onStatus: options.onStatus,
    runtime: options.runtime,
    scope: selectedView,
  })

  const visibleMailboxes = createMemo(() => mailboxes().filter((row) => row.selectable))

  const mailboxTreeRows = createMemo<readonly MailboxTreeRow[]>(
    (previous) =>
      reconcileRows(
        previous,
        buildMailboxTreeRows({
          accounts: options.config()?.accounts ?? [],
          accountUnread: accountUnread(),
          mailboxes: visibleMailboxes(),
          counts: counts(),
          unread: unread(),
          outboxCount: outboxView.entries().length,
          draftCount: outboxView.drafts().length,
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
        const client = yield* MailClient
        const snapshot = yield* client.mailboxSnapshot
        yield* Effect.sync(() => {
          setMailboxes(snapshot.mailboxes)
          const next = new Map<MailboxId, MailboxCounts>()
          for (const entry of snapshot.counts) {
            next.set(entry.mailboxId, entry.counts)
          }
          setCounts(next)
          const nextAccountUnread = new Map<AccountId, number>()
          for (const entry of snapshot.accountUnread) {
            nextAccountUnread.set(entry.accountId, entry.unread)
          }
          setAccountUnread(nextAccountUnread)
          setUnread(snapshot.unread)
          selectInitialRow()
        })
      }).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => {
            reportFailure("could not load the mailboxes", error)
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (mailboxLoadToken === token) {
              setLoadingMailboxes(false)
            }
          }),
        ),
        Effect.ignore,
      )
      options.runtime.runFork(
        program.pipe(reportDefects("could not load the mailboxes", options.onStatus)),
      )
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
    selectedTarget: messagePane.selectedTarget,
    markedTargets: messagePane.markedTargetList,
  })

  const mailboxMute = useMailboxMute({
    runtime: options.runtime,
    onStatus: options.onStatus,
    onChanged: loadMailboxData,
    onDisconnected: options.onDisconnected,
  })

  const syncEvents = useMailSyncEvents({
    mailboxes,
    visibleMailboxes,
    selectedListKey,
    searchActive: messagePane.searchActive,
    onStatus: options.onStatus,
    onNewMail: options.onNewMail,
    onMailboxesChanged: loadMailboxData,
    onReloadCurrent: messagePane.reloadCurrent,
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

  const applyEvent = (event: ServerEvent) => {
    if (event._tag === "data-changed") {
      loadMailboxData()
      messagePane.reloadCurrent()
      outboxView.load()
      return
    }
    if (event._tag === "config-changed") {
      options.onConfigChanged()
      return
    }
    syncEvents.applySyncEvent(event)
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
    outboxView,
    selectedListKey,
    selectedMailboxTreeRow,
    selectedMailbox,
    selectedView,
    syncingMailboxIds: syncEvents.syncingMailboxIds,
    unread,
    visibleMailboxes,
    loadMailboxData,
    moveRowSelection,
    selectView: (view: MailViewKind) => {
      setSelectedListKey(listKeyForView(view))
    },
    toggleAccountRow,
    toggleMailboxMuted,
  }
}
type MailStore = ReturnType<typeof useMailStore>

export { useMailStore, type MailStore, type MailStoreOptions }
