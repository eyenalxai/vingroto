import type { MessageDetail, MessageListItem } from "@vingroto/core/protocol/mail"

import { Effect, Fiber } from "effect"
import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"

import type { MailClientError } from "@/lib/api"
import type { BodyState } from "@/lib/mail/body-state"
import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"
import { bodyState } from "@/lib/mail/body-state"
import { parseListKey } from "@/lib/mail/mailbox-tree"

const messageWindow = 500

interface MessagePaneOptions {
  readonly runtime: AppRuntime
  readonly listKey: () => string | undefined
  readonly onStatus: (status: string) => void
  readonly onDisconnected: (message: string) => void
}

const useMessagePane = (options: MessagePaneOptions) => {
  const [messages, setMessages] = createSignal<readonly MessageListItem[]>([])
  const [detail, setDetail] = createSignal<MessageDetail | undefined>()
  const [body, setBody] = createSignal<BodyState | undefined>()
  const [selectedMessageId, setSelectedMessageId] = createSignal<number | undefined>()
  const [markedIds, setMarkedIds] = createSignal<ReadonlySet<number>>(new Set())
  const [loadingMessages, setLoadingMessages] = createSignal(false)
  const [loadingDetail, setLoadingDetail] = createSignal(false)
  const [loadedListKey, setLoadedListKey] = createSignal<string | undefined>()
  let messageLoadToken = 0

  const selectedMessage = createMemo(() => messages().find((row) => row.id === selectedMessageId()))

  const markedMessages = createMemo(() => {
    const ids = markedIds()
    return messages().filter((row) => ids.has(row.id))
  })

  const reportFailure = (label: string, error: MailClientError) => {
    const failure = describeClientFailure(error)
    if (failure._tag === "connection") {
      options.onDisconnected(failure.message)
      return
    }
    options.onStatus(`${label} · ${failure.message}`)
  }

  const applyMessageRows = (rows: readonly MessageListItem[]) => {
    setMessages(rows)
    const current = selectedMessageId()
    if (current === undefined || !rows.some((row) => row.id === current)) {
      setSelectedMessageId(rows[0]?.id)
    }
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
        setMessages([])
        setDetail(undefined)
        setBody(undefined)
        setSelectedMessageId(undefined)
        setLoadingDetail(false)
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
            applyMessageRows(rows)
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

  const loadDetail = (messageId: number) => {
    untrack(() => {
      setLoadingDetail(true)
      const program = Effect.gen(function* loadMessageDetail() {
        yield* Effect.gen(function* queryMessageDetail() {
          const client = yield* MailClient
          const value = yield* client.getMessage(messageId)
          yield* Effect.sync(() => {
            if (selectedMessageId() === messageId) {
              setDetail(value ?? undefined)
            }
          })
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              reportFailure("could not load the message", error)
            }),
          ),
        )
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (selectedMessageId() === messageId) {
              setLoadingDetail(false)
            }
          }),
        ),
      )
      options.runtime.runFork(program)
    })
  }

  const applyBody = (messageId: number, state: BodyState) => {
    if (selectedMessageId() === messageId) {
      setBody(state)
    }
  }

  const loadBody = (messageId: number) =>
    untrack(() => {
      const program = Effect.gen(function* loadMessageBody() {
        yield* Effect.sync(() => {
          applyBody(messageId, bodyState.loading())
        })
        const client = yield* MailClient
        yield* client.loadBody(messageId).pipe(
          Effect.tap((loaded) =>
            Effect.sync(() => {
              applyBody(messageId, bodyState.loaded({ html: loaded.html, text: loaded.text }))
            }),
          ),
          Effect.catch((error) =>
            Effect.sync(() => {
              const failure = describeClientFailure(error)
              applyBody(messageId, bodyState.error({ message: failure.message }))
              if (failure._tag === "connection") {
                options.onDisconnected(failure.message)
              }
            }),
          ),
        )
      })
      return options.runtime.runFork(program)
    })

  const moveMessageSelection = (delta: number) => {
    const rows = messages()
    const index = rows.findIndex((row) => row.id === selectedMessageId())
    const clamped = Math.min(Math.max(index === -1 ? 0 : index + delta, 0), rows.length - 1)
    const next = rows[clamped]
    if (next !== undefined) {
      setSelectedMessageId(next.id)
    }
  }

  const toggleMark = (messageId: number) => {
    setMarkedIds((current) => {
      const next = new Set<number>(current)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
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
    const rows = messages()
    setMarkedIds((current) => {
      const allMarked = rows.length > 0 && rows.every((row) => current.has(row.id))
      return allMarked ? new Set<number>() : new Set<number>(rows.map((row) => row.id))
    })
  }

  const clearMarks = () => {
    setMarkedIds(new Set<number>())
  }

  const reloadCurrent = () => {
    loadListMessages()
  }

  createEffect(() => {
    options.listKey()
    clearMarks()
    loadListMessages()
  })

  createEffect(() => {
    const messageId = selectedMessageId()
    setDetail(undefined)
    setBody(undefined)
    if (messageId === undefined) {
      setLoadingDetail(false)
      return
    }
    loadDetail(messageId)
    const fiber = loadBody(messageId)
    if (fiber === undefined) {
      return
    }
    onCleanup(() => {
      // Moving the selection cancels a body download that is no longer on screen.
      options.runtime.runFork(Fiber.interrupt(fiber))
    })
  })

  return {
    body,
    clearMarks,
    detail,
    loadingDetail,
    loadingMessages,
    markedIds,
    markedMessages,
    messages,
    moveMessageSelection,
    reloadCurrent,
    selectedMessage,
    selectedMessageId,
    toggleMarkAll,
    toggleMarkCurrent,
  }
}

export { useMessagePane, type MessagePaneOptions }
