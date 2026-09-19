import type { MessageId } from "@vingroto/core/ids"
import type { MessageListItem, MessageTarget } from "@vingroto/core/protocol/mail"

import { Effect } from "effect"
import { createEffect, createMemo, createSignal, untrack } from "solid-js"

import type { MailClientError } from "@/lib/api"
import type { AppRuntime } from "@/lib/runtime"

import { useMessageDetail } from "@/components/use-message-detail"
import { useMessageSearch } from "@/components/use-message-search"
import { useReadOnDisplay } from "@/components/use-read-on-display"
import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"
import { parseListKey } from "@/lib/mail/mailbox-tree"

const messageWindow = 500

interface MessagePaneOptions {
  readonly runtime: AppRuntime
  readonly listKey: () => string | undefined
  readonly onStatus: (status: string) => void
  readonly onDisconnected: (message: string) => void
}

const targetOf = (row: MessageListItem): MessageTarget => {
  return { id: row.id, accountId: row.accountId, mailboxPath: row.mailboxPath }
}

const useMessagePane = (options: MessagePaneOptions) => {
  const [messages, setMessages] = createSignal<readonly MessageListItem[]>([])
  const [selectedMessageId, setSelectedMessageId] = createSignal<MessageId | undefined>()
  const [markedTargets, setMarkedTargets] = createSignal<ReadonlyMap<MessageId, MessageTarget>>(
    new Map(),
  )
  const [loadingMessages, setLoadingMessages] = createSignal(false)
  const [loadedListKey, setLoadedListKey] = createSignal<string | undefined>()
  let messageLoadToken = 0

  const selectedMessage = createMemo(() => messages().find((row) => row.id === selectedMessageId()))
  const selectedTarget = createMemo((): MessageTarget | undefined => {
    const row = selectedMessage()
    return row === undefined ? undefined : targetOf(row)
  })
  const markedIds = createMemo(() => new Set(markedTargets().keys()))
  const markedTargetList = createMemo(() => [...markedTargets().values()])

  const detail = useMessageDetail({
    listKey: options.listKey,
    onDisconnected: options.onDisconnected,
    onStatus: options.onStatus,
    runtime: options.runtime,
    selectedMessageId,
  })

  const readOnDisplay = useReadOnDisplay({
    detail: detail.detail,
    listKey: options.listKey,
    messages,
    onDisconnected: options.onDisconnected,
    onStatus: options.onStatus,
    runtime: options.runtime,
    selectedMessageId,
    setMessages,
    setSelectedMessageId,
  })

  const search = useMessageSearch({
    applyRows: readOnDisplay.applyMessageRows,
    listKey: options.listKey,
    onDisconnected: options.onDisconnected,
    onQueryChanged: readOnDisplay.reset,
    onStatus: options.onStatus,
    runtime: options.runtime,
  })

  const reportFailure = (label: string, error: MailClientError) => {
    const failure = describeClientFailure(error)
    if (failure._tag === "connection") {
      options.onDisconnected(failure.message)
      return
    }
    options.onStatus(`${label} · ${failure.message}`)
  }

  const loadListMessages = () => {
    untrack(() => {
      const key = options.listKey()
      const target = parseListKey(key)
      if (key === undefined || target === undefined) {
        return
      }
      if (loadedListKey() !== key) {
        setLoadedListKey(key)
        readOnDisplay.reset()
        setMessages([])
        setSelectedMessageId(undefined)
      }
      messageLoadToken += 1
      const token = messageLoadToken
      setLoadingMessages(true)
      const program = Effect.gen(function* loadMessageRows() {
        yield* Effect.gen(function* queryMessageRows() {
          const client = yield* MailClient
          const rows = yield* client.listMessages(target, messageWindow)
          yield* Effect.sync(() => {
            // The selection may have moved on while the query ran: never apply rows for another list.
            if (options.listKey() !== key) {
              return
            }
            readOnDisplay.applyMessageRows(rows)
          })
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              reportFailure("could not load the messages", error)
            }),
          ),
        )
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (messageLoadToken === token) {
              setLoadingMessages(false)
            }
          }),
        ),
      )
      options.runtime.runFork(program)
    })
  }

  const setSearchQuery = (next: string) => {
    search.updateQuery(next)
    if (next.length === 0) {
      loadListMessages()
    }
  }

  const clearSearch = () => {
    search.cancel()
    loadListMessages()
  }

  const commitSearch = () => {
    search.commit()
  }

  const typeSearchCharacter = (character: string) => {
    setSearchQuery(search.query() + character)
  }

  const searchBackspace = () => {
    setSearchQuery(search.query().slice(0, -1))
  }

  const maybeGrowSearch = (index: number, rowCount: number) => {
    if (!search.active() || !search.hasMore()) {
      return
    }
    if (index >= Math.floor(rowCount / 2)) {
      search.grow()
    }
  }

  const moveMessageSelection = (delta: number) => {
    const rows = messages()
    const index = rows.findIndex((row) => row.id === selectedMessageId())
    const clamped = Math.min(Math.max(index === -1 ? 0 : index + delta, 0), rows.length - 1)
    const next = rows[clamped]
    if (next !== undefined) {
      setSelectedMessageId(next.id)
      maybeGrowSearch(clamped, rows.length)
    }
  }

  const toggleMark = (messageId: MessageId) => {
    setMarkedTargets((current) => {
      const next = new Map(current)
      if (next.delete(messageId)) {
        return next
      }
      const row = messages().find((entry) => entry.id === messageId)
      if (row !== undefined) {
        next.set(messageId, targetOf(row))
      }
      return next
    })
  }

  const toggleMarkCurrent = () => {
    const messageId = selectedMessageId()
    if (messageId === undefined) {
      return
    }
    toggleMark(messageId)
    moveMessageSelection(1)
  }

  const toggleMarkAll = () => {
    if (search.active()) {
      search.fetchMarks((targets) => {
        setMarkedTargets((current) => {
          const allMarked = targets.length > 0 && targets.every((target) => current.has(target.id))
          return allMarked
            ? new Map()
            : new Map(targets.map((target): [MessageId, MessageTarget] => [target.id, target]))
        })
      })
      return
    }
    const rows = messages()
    setMarkedTargets((current) => {
      const allMarked = rows.length > 0 && rows.every((row) => current.has(row.id))
      if (allMarked) {
        return new Map()
      }
      return new Map(rows.map((row): [MessageId, MessageTarget] => [row.id, targetOf(row)]))
    })
  }

  const clearMarks = () => {
    setMarkedTargets(new Map())
  }

  const reloadCurrent = () => {
    if (search.active()) {
      search.reload()
      return
    }
    loadListMessages()
  }

  createEffect(() => {
    options.listKey()
    clearMarks()
    search.cancel()
    loadListMessages()
  })

  return {
    applyReadOnDisplay: readOnDisplay.applyReadOnDisplay,
    beginSearch: search.begin,
    body: detail.body,
    clearMarks,
    clearSearch,
    commitSearch,
    detail: detail.detail,
    dropRetained: readOnDisplay.dropRetained,
    loadingDetail: detail.loadingDetail,
    loadingMessages,
    markedIds,
    markedTargetList,
    messages,
    moveMessageSelection,
    reloadCurrent,
    searchActive: search.active,
    searchBackspace,
    searchEditing: search.editing,
    searchQuery: search.query,
    selectedMessage,
    selectedMessageId,
    selectedTarget,
    toggleMarkAll,
    toggleMarkCurrent,
    typeSearchCharacter,
  }
}

export { useMessagePane, type MessagePaneOptions }
