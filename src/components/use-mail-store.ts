import { Effect, Fiber, Stream } from "effect"
import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"

import type { AppConfig } from "@/lib/config/schema"
import type { FolderRow } from "@/lib/mail/folders"
import type { SyncEvent } from "@/lib/mail/sync"
import type { AppRuntime } from "@/lib/runtime"
import type { MailboxRow } from "@/lib/store/mailboxes"
import type { MailboxCounts } from "@/lib/store/messages"

import { useMessagePane } from "@/components/use-message-pane"
import { describeError } from "@/lib/errors"
import { buildFolderRows, parseFolderKey } from "@/lib/mail/folders"
import { MessagePrefetch } from "@/lib/mail/prefetch"
import { SyncEngine, describeSyncEvent } from "@/lib/mail/sync"
import { listMailboxes } from "@/lib/store/mailboxes"
import { messageCounts, unreadMessageCount } from "@/lib/store/messages"

interface MailStoreOptions {
  readonly runtime: AppRuntime
  readonly config: () => AppConfig | undefined
  readonly onStatus: (status: string) => void
}

const useMailStore = (options: MailStoreOptions) => {
  const [mailboxes, setMailboxes] = createSignal<readonly MailboxRow[]>([])
  const [counts, setCounts] = createSignal<ReadonlyMap<number, MailboxCounts>>(new Map())
  const [unread, setUnread] = createSignal(0)
  const [selectedFolderKey, setSelectedFolderKey] = createSignal<string | undefined>()
  const [collapsedAccounts, setCollapsedAccounts] = createSignal<ReadonlySet<string>>(new Set())

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
      })
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

  const applySyncEvent = (event: SyncEvent) => {
    untrack(() => {
      options.onStatus(describeSyncEvent(event))
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
    counts,
    folderRows,
    mailboxes,
    selectedFolderKey,
    selectedFolderRow,
    selectedMailbox,
    unread,
    visibleMailboxes,
    loadFolderData,
    moveFolderSelection,
    prefetchUnread,
    toggleAccountRow,
  }
}

type MailStore = ReturnType<typeof useMailStore>

export { useMailStore, type MailStore, type MailStoreOptions }
