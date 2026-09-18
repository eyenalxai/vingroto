import type { AppConfig } from "@vingroto/core/config/schema"
import type { ServerEvent, SyncEvent } from "@vingroto/core/protocol/events"
import type { Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

import { describeSyncEvent } from "@vingroto/core/protocol/events"
import { Effect } from "effect"
import { createEffect, createMemo, createSignal, untrack } from "solid-js"

import type { MailClientError } from "@/lib/api"
import type { FolderRow } from "@/lib/mail/folders"
import type { AppRuntime } from "@/lib/runtime"

import { useMessageActions } from "@/components/use-message-actions"
import { useMessagePane } from "@/components/use-message-pane"
import { useServerEvents } from "@/components/use-server-events"
import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"
import { buildFolderRows, parseFolderKey } from "@/lib/mail/folders"

interface MailStoreOptions {
  readonly runtime: AppRuntime
  readonly config: () => AppConfig | undefined
  readonly connected: () => boolean
  readonly onStatus: (status: string) => void
  readonly onDisconnected: (message: string) => void
  readonly onConfigChanged: () => void
}

const withoutId = (current: ReadonlySet<number>, id: number) =>
  new Set([...current].filter((entry) => entry !== id))

const useMailStore = (options: MailStoreOptions) => {
  const [mailboxes, setMailboxes] = createSignal<readonly Mailbox[]>([])
  const [counts, setCounts] = createSignal<ReadonlyMap<number, MailboxCounts>>(new Map())
  const [unread, setUnread] = createSignal(0)
  const [selectedFolderKey, setSelectedFolderKey] = createSignal<string | undefined>()
  const [collapsedAccounts, setCollapsedAccounts] = createSignal<ReadonlySet<string>>(new Set())
  const [loadingFolders, setLoadingFolders] = createSignal(false)
  const [mutingMailboxIds, setMutingMailboxIds] = createSignal<ReadonlySet<number>>(new Set())
  const [syncingMailboxIds, setSyncingMailboxIds] = createSignal<ReadonlySet<number>>(new Set())
  let folderLoadToken = 0

  const visibleMailboxes = createMemo(() => mailboxes().filter((row) => row.selectable))

  const folderRows = createMemo<readonly FolderRow[]>(() =>
    buildFolderRows({
      accounts: options.config()?.accounts ?? [],
      mailboxes: visibleMailboxes(),
      counts: counts(),
      unread: unread(),
      collapsed: collapsedAccounts(),
    }),
  )

  const selectedFolderRow = createMemo(() =>
    folderRows().find((row) => row.key === selectedFolderKey()),
  )

  const selectedMailbox = createMemo((): Mailbox | undefined => {
    const target = parseFolderKey(selectedFolderKey())
    if (target === undefined || target.kind !== "mailbox") {
      return undefined
    }
    return visibleMailboxes().find((row) => row.id === target.mailboxId)
  })

  const reportFailure = (label: string, error: MailClientError) => {
    const failure = describeClientFailure(error)
    if (failure._tag === "server") {
      options.onStatus(`${label} · ${failure.message}`)
      return
    }
    options.onDisconnected(failure.message)
  }

  const messagePane = useMessagePane({
    folderKey: selectedFolderKey,
    onDisconnected: options.onDisconnected,
    onStatus: options.onStatus,
    runtime: options.runtime,
  })

  const selectInitialFolder = () => {
    untrack(() => {
      const rows = folderRows()
      const current = selectedFolderKey()
      if (current !== undefined && rows.some((row) => row.key === current)) {
        return
      }
      const mailboxRows = rows.filter((row) => row.kind === "mailbox")
      const inbox = mailboxRows.find((row) => row.label.toLowerCase() === "inbox")
      setSelectedFolderKey((inbox ?? mailboxRows[0] ?? rows[0])?.key)
    })
  }

  const loadFolderData = () => {
    untrack(() => {
      folderLoadToken += 1
      const token = folderLoadToken
      setLoadingFolders(true)
      const program = Effect.gen(function* loadFolderRows() {
        yield* Effect.gen(function* queryFolderRows() {
          const client = yield* MailClient
          const snapshot = yield* client.folderSnapshot()
          yield* Effect.sync(() => {
            setMailboxes(snapshot.mailboxes)
            const next = new Map<number, MailboxCounts>()
            for (const entry of snapshot.counts) {
              next.set(entry.mailboxId, entry.counts)
            }
            setCounts(next)
            setUnread(snapshot.unread)
            selectInitialFolder()
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
            if (folderLoadToken === token) {
              setLoadingFolders(false)
            }
          }),
        ),
      )
      options.runtime.runFork(program)
    })
  }

  const messageActions = useMessageActions({
    onChanged: (affected: number) => {
      loadFolderData()
      messagePane.reloadCurrent()
      if (affected > 0) {
        messagePane.clearTags()
      }
    },
    onDisconnected: options.onDisconnected,
    onStatus: options.onStatus,
    runtime: options.runtime,
    selectedMessage: messagePane.selectedMessage,
    taggedMessages: messagePane.taggedMessages,
  })

  const toggleMailboxMuted = () => {
    const mailbox = selectedMailbox()
    if (mailbox === undefined) {
      options.onStatus("select a mailbox to mute")
      return
    }
    const muted = !mailbox.muted
    setMutingMailboxIds((current) => new Set(current).add(mailbox.id))
    const program = Effect.gen(function* muteMailbox() {
      const client = yield* MailClient
      yield* client.setMailboxMuted(mailbox.id, muted).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            options.onStatus(muted ? `${mailbox.name} muted` : `${mailbox.name} unmuted`)
            loadFolderData()
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            reportFailure("could not update the mailbox", error)
          }),
        ),
      )
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          setMutingMailboxIds((current) => withoutId(current, mailbox.id))
        }),
      ),
    )
    options.runtime.runFork(program)
  }

  const moveFolderSelection = (delta: number) => {
    const rows = folderRows()
    const index = rows.findIndex((row) => row.key === selectedFolderKey())
    const clamped = Math.min(Math.max(index === -1 ? 0 : index + delta, 0), rows.length - 1)
    const next = rows[clamped]
    if (next !== undefined) {
      setSelectedFolderKey(next.key)
    }
  }

  const toggleAccountRow = (key: string) => {
    const accountId = key.slice("account:".length)
    setCollapsedAccounts((current) => {
      const next = new Set(current)
      if (next.has(accountId)) {
        next.delete(accountId)
      } else {
        next.add(accountId)
      }
      return next
    })
    setSelectedFolderKey(key)
  }

  const mailboxIdFor = (accountId: string, path: string) =>
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
        setSyncingMailboxIds(new Set<number>())
      } else {
        const id = mailboxIdFor(event.accountId, event.path)
        if (id !== undefined) {
          setSyncingMailboxIds((current) => withoutId(current, id))
        }
      }
      loadFolderData()
      const target = parseFolderKey(selectedFolderKey())
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
      loadFolderData()
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
    loadFolderData()
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
    folderRows,
    loadingFolders,
    mailboxes,
    mutingMailboxIds,
    selectedFolderKey,
    selectedFolderRow,
    selectedMailbox,
    syncingMailboxIds,
    unread,
    visibleMailboxes,
    loadFolderData,
    moveFolderSelection,
    toggleAccountRow,
    toggleMailboxMuted,
  }
}
type MailStore = ReturnType<typeof useMailStore>

export { useMailStore, type MailStore, type MailStoreOptions }
