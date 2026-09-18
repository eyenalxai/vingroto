import { Effect, Fiber, Stream } from "effect"
import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"

import type { AppConfig } from "@/lib/config/schema"
import type { FolderRow } from "@/lib/mail/folders"
import type { SyncEvent } from "@/lib/mail/sync"
import type { AppRuntime } from "@/lib/runtime"
import type { MailboxRow } from "@/lib/store/mailboxes"
import type { MailboxCounts } from "@/lib/store/messages"

import { useMessageActions } from "@/components/use-message-actions"
import { useMessagePane } from "@/components/use-message-pane"
import { describeError } from "@/lib/errors"
import { buildFolderRows, parseFolderKey } from "@/lib/mail/folders"
import { MessagePrefetch } from "@/lib/mail/prefetch"
import { SyncEngine, describeSyncEvent } from "@/lib/mail/sync"
import { listMailboxes, setMailboxMuted } from "@/lib/store/mailboxes"
import { messageCounts, unreadMessageCount } from "@/lib/store/messages"

interface MailStoreOptions {
  readonly runtime: AppRuntime
  readonly config: () => AppConfig | undefined
  readonly onStatus: (status: string) => void
}

const withoutId = (current: ReadonlySet<number>, id: number) =>
  new Set([...current].filter((entry) => entry !== id))

const useMailStore = (options: MailStoreOptions) => {
  const [mailboxes, setMailboxes] = createSignal<readonly MailboxRow[]>([])
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

  const selectedMailbox = createMemo((): MailboxRow | undefined => {
    const target = parseFolderKey(selectedFolderKey())
    if (target === undefined || target.kind !== "mailbox") {
      return undefined
    }
    return visibleMailboxes().find((row) => row.id === target.id)
  })

  const messagePane = useMessagePane({
    runtime: options.runtime,
    config: options.config,
    folderKey: selectedFolderKey,
    onStatus: options.onStatus,
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
          const rows = yield* listMailboxes()
          const counters = yield* messageCounts()
          const unreadTotal = yield* unreadMessageCount()
          yield* Effect.sync(() => {
            setMailboxes(rows)
            setCounts(counters)
            setUnread(unreadTotal)
            selectInitialFolder()
          })
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              options.onStatus(`database error · ${describeError(error)}`)
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

  const prefetchUnread = () => {
    untrack(() => {
      const config = options.config()
      if (config === undefined) {
        return
      }
      const program = Effect.gen(function* prefetchUnreadBodies() {
        const prefetch = yield* MessagePrefetch
        yield* prefetch.unread(config.accounts)
      })
      options.runtime.runFork(program)
    })
  }

  const messageActions = useMessageActions({
    runtime: options.runtime,
    config: options.config,
    selectedMessage: messagePane.selectedMessage,
    taggedMessages: messagePane.taggedMessages,
    onChanged: (affected: number) => {
      loadFolderData()
      messagePane.reloadCurrent()
      if (affected > 0) {
        messagePane.clearTags()
      }
    },
    onStatus: options.onStatus,
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
      yield* setMailboxMuted(mailbox.id, muted).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            options.onStatus(muted ? `${mailbox.name} muted` : `${mailbox.name} unmuted`)
            loadFolderData()
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            options.onStatus(`could not update the mailbox · ${describeError(error)}`)
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
        const mailbox = visibleMailboxes().find((row) => row.id === target.id)
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

  createEffect(() => {
    if (options.config() === undefined) {
      return
    }
    loadFolderData()
    prefetchUnread()
  })

  createEffect(() => {
    const program = SyncEngine.pipe(
      Effect.flatMap((sync) =>
        sync.events.pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              applySyncEvent(event)
            }),
          ),
        ),
      ),
    )
    const fiber = options.runtime.runFork(program)
    onCleanup(() => {
      options.runtime.runFork(Fiber.interrupt(fiber))
    })
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
    prefetchUnread,
    toggleAccountRow,
    toggleMailboxMuted,
  }
}

type MailStore = ReturnType<typeof useMailStore>

export { useMailStore, type MailStore, type MailStoreOptions }
