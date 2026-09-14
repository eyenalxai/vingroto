import { Effect } from "effect"
import { createEffect, createMemo, createSignal, untrack } from "solid-js"

import type { BodyState } from "@/components/message-view"
import type { AppConfig } from "@/lib/config/schema"
import type { AppRuntime } from "@/lib/runtime"
import type { MessageDetail, MessageListItem, VirtualFolderKind } from "@/lib/store/messages"

import { describeError } from "@/lib/errors"
import { MessageBodies } from "@/lib/mail/bodies"
import { parseFolderKey } from "@/lib/mail/folders"
import { getMessage, getMessageBody, listMessages, listVirtualMessages } from "@/lib/store/messages"

const messageWindow = 500

interface MessagePaneOptions {
  readonly runtime: AppRuntime
  readonly config: () => AppConfig | undefined
  readonly folderKey: () => string | undefined
  readonly onStatus: (status: string) => void
}

const useMessagePane = (options: MessagePaneOptions) => {
  const [messages, setMessages] = createSignal<readonly MessageListItem[]>([])
  const [listIsVirtual, setListIsVirtual] = createSignal(false)
  const [detail, setDetail] = createSignal<MessageDetail | undefined>()
  const [body, setBody] = createSignal<BodyState>({ _tag: "empty" })
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
            setListIsVirtual(false)
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
            setListIsVirtual(true)
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

  const loadCachedBody = (messageId: number) => {
    untrack(() => {
      const program = Effect.gen(function* loadCachedMessageBody() {
        yield* Effect.gen(function* queryMessageBody() {
          const cached = yield* getMessageBody(messageId)
          yield* Effect.sync(() => {
            if (selectedMessageId() !== messageId) {
              return
            }
            if (cached === undefined) {
              setBody({ _tag: "empty" })
              return
            }
            setBody({ _tag: "loaded", text: cached.text, html: cached.html })
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

  const downloadBody = () => {
    untrack(() => {
      const message = selectedMessage()
      const config = options.config()
      if (message === undefined || config === undefined) {
        return
      }
      const state = body()
      if (state._tag === "loading" || state._tag === "loaded") {
        return
      }
      const account = config.accounts.find((entry) => entry.id === message.accountId)
      if (account === undefined) {
        setBody({
          _tag: "error",
          message: `account ${message.accountId} is not part of the configuration`,
        })
        return
      }
      setBody({ _tag: "loading" })
      const program = Effect.gen(function* loadMessageBody() {
        yield* Effect.gen(function* fetchMessageBody() {
          const bodies = yield* MessageBodies
          const loaded = yield* bodies.load({
            account,
            mailboxPath: message.mailboxPath,
            messageId: message.id,
            uid: message.uid,
          })
          yield* Effect.sync(() => {
            if (selectedMessageId() === message.id) {
              setBody({ _tag: "loaded", text: loaded.text, html: loaded.html })
            }
          })
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              if (selectedMessageId() === message.id) {
                setBody({ _tag: "error", message: describeError(error) })
              }
            }),
          ),
        )
      })
      options.runtime.runFork(program)
    })
  }

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
      setBody({ _tag: "empty" })
      return
    }
    loadDetail(messageId)
    loadCachedBody(messageId)
  })

  return {
    body,
    detail,
    listIsVirtual,
    messages,
    selectedMessage,
    selectedMessageId,
    downloadBody,
    moveMessageSelection,
    reloadCurrent,
  }
}

export { useMessagePane, type MessagePaneOptions }
