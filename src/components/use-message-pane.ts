import { Effect, Fiber } from "effect"
import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"

import type { BodyState } from "@/components/message-view"
import type { AppConfig } from "@/lib/config/schema"
import type { AppRuntime } from "@/lib/runtime"
import type { MessageDetail, MessageListItem, VirtualFolderKind } from "@/lib/store/messages"

import { describeError } from "@/lib/errors"
import { MessageBodies } from "@/lib/mail/bodies"
import { parseFolderKey } from "@/lib/mail/folders"
import { getMessageBody } from "@/lib/store/bodies"
import { getMessage, listMessages, listVirtualMessages } from "@/lib/store/messages"

const messageWindow = 500

interface MessagePaneOptions {
  readonly runtime: AppRuntime
  readonly config: () => AppConfig | undefined
  readonly folderKey: () => string | undefined
  readonly onStatus: (status: string) => void
}

const useMessagePane = (options: MessagePaneOptions) => {
  const [messages, setMessages] = createSignal<readonly MessageListItem[]>([])
  const [detail, setDetail] = createSignal<MessageDetail | undefined>()
  const [body, setBody] = createSignal<BodyState | undefined>()
  const [selectedMessageId, setSelectedMessageId] = createSignal<number | undefined>()

  const selectedMessage = createMemo(() => messages().find((row) => row.id === selectedMessageId()))

  const applyMessageRows = (rows: readonly MessageListItem[]) => {
    setMessages(rows)
    const current = selectedMessageId()
    if (current === undefined || !rows.some((row) => row.id === current)) {
      setSelectedMessageId(rows[0]?.id)
    }
  }

  const loadMessages = (mailboxId: number) => {
    untrack(() => {
      const program = Effect.gen(function* loadMessageRows() {
        yield* Effect.gen(function* queryMessageRows() {
          const rows = yield* listMessages(mailboxId, messageWindow)
          yield* Effect.sync(() => {
            // The selection may have moved on while the query ran: never apply rows for another folder.
            const current = parseFolderKey(options.folderKey())
            if (current?.kind !== "mailbox" || current.id !== mailboxId) {
              return
            }
            applyMessageRows(rows)
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

  const loadVirtualMessages = (kind: VirtualFolderKind) => {
    untrack(() => {
      const program = Effect.gen(function* loadVirtualMessageRows() {
        yield* Effect.gen(function* queryVirtualMessageRows() {
          const rows = yield* listVirtualMessages(kind, messageWindow)
          yield* Effect.sync(() => {
            if (parseFolderKey(options.folderKey())?.kind !== kind) {
              return
            }
            applyMessageRows(rows)
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

  const loadDetail = (messageId: number) => {
    untrack(() => {
      const program = Effect.gen(function* loadMessageDetail() {
        yield* Effect.gen(function* queryMessageDetail() {
          const value = yield* getMessage(messageId)
          yield* Effect.sync(() => {
            if (selectedMessageId() === messageId) {
              setDetail(value)
            }
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

  const applyBody = (messageId: number, state: BodyState) => {
    if (selectedMessageId() === messageId) {
      setBody(state)
    }
  }

  const loadBody = (messageId: number) =>
    untrack(() => {
      const program = Effect.gen(function* loadMessageBody() {
        yield* Effect.gen(function* readMessageBody() {
          const message = messages().find((row) => row.id === messageId)
          const config = options.config()
          if (message === undefined || config === undefined) {
            return
          }
          const account = config.accounts.find((entry) => entry.id === message.accountId)
          if (account === undefined) {
            yield* Effect.sync(() => {
              applyBody(messageId, {
                _tag: "error",
                message: `account ${message.accountId} is not part of the configuration`,
              })
            })
            return
          }
          const cached = yield* getMessageBody(messageId)
          if (cached !== undefined) {
            yield* Effect.sync(() => {
              applyBody(messageId, { _tag: "loaded", text: cached.text, html: cached.html })
            })
            return
          }
          yield* Effect.sync(() => {
            applyBody(messageId, { _tag: "loading" })
          })
          const bodies = yield* MessageBodies
          const loaded = yield* bodies.load({
            account,
            mailboxPath: message.mailboxPath,
            messageId,
            uid: message.uid,
          })
          yield* Effect.sync(() => {
            applyBody(messageId, { _tag: "loaded", text: loaded.text, html: loaded.html })
          })
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              applyBody(messageId, { _tag: "error", message: describeError(error) })
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

  const reloadCurrent = () => {
    const target = parseFolderKey(options.folderKey())
    if (target === undefined) {
      return
    }
    if (target.kind === "mailbox") {
      loadMessages(target.id)
      return
    }
    loadVirtualMessages(target.kind)
  }

  createEffect(() => {
    const target = parseFolderKey(options.folderKey())
    if (target === undefined) {
      return
    }
    if (target.kind === "mailbox") {
      loadMessages(target.id)
      return
    }
    loadVirtualMessages(target.kind)
  })

  createEffect(() => {
    const messageId = selectedMessageId()
    if (messageId === undefined) {
      setDetail()
      setBody(undefined)
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
    detail,
    messages,
    selectedMessage,
    selectedMessageId,
    moveMessageSelection,
    reloadCurrent,
  }
}

export { useMessagePane, type MessagePaneOptions }
