import type { MessageId } from "@vingroto/core/ids"
import type { MessageDetail } from "@vingroto/core/protocol/mail"

import { Effect, Fiber } from "effect"
import * as Option from "effect/Option"
import { createEffect, createSignal, onCleanup } from "solid-js"

import type { MailClientError } from "@/lib/api"
import type { BodyState } from "@/lib/mail/body-state"
import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"
import { bodyState } from "@/lib/mail/body-state"
import { parseListKey } from "@/lib/mail/mailbox-tree"

interface MessageDetailOptions {
  readonly runtime: AppRuntime
  readonly listKey: () => string | undefined
  readonly selectedMessageId: () => MessageId | undefined
  readonly onStatus: (status: string) => void
  readonly onDisconnected: (message: string) => void
}

const useMessageDetail = (options: MessageDetailOptions) => {
  const [detail, setDetail] = createSignal<MessageDetail | undefined>()
  const [body, setBody] = createSignal<BodyState | undefined>()
  const [loadingDetail, setLoadingDetail] = createSignal(false)

  const reportFailure = (label: string, error: MailClientError) => {
    const failure = describeClientFailure(error)
    if (failure._tag === "connection") {
      options.onDisconnected(failure.message)
      return
    }
    options.onStatus(`${label} · ${failure.message}`)
  }

  const loadDetail = (messageId: MessageId) => {
    setLoadingDetail(true)
    const program = Effect.gen(function* loadMessageDetail() {
      yield* Effect.gen(function* queryMessageDetail() {
        const client = yield* MailClient
        const value = yield* client.getMessage(messageId)
        yield* Effect.sync(() => {
          if (options.selectedMessageId() === messageId) {
            setDetail(Option.getOrUndefined(value))
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
          if (options.selectedMessageId() === messageId) {
            setLoadingDetail(false)
          }
        }),
      ),
    )
    options.runtime.runFork(program)
  }

  const applyBody = (messageId: MessageId, state: BodyState) => {
    if (options.selectedMessageId() === messageId) {
      setBody(state)
    }
  }

  const loadBody = (messageId: MessageId) => {
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
  }

  createEffect(() => {
    const target = parseListKey(options.listKey())
    const messageId = options.selectedMessageId()
    setDetail(undefined)
    setBody(undefined)
    if (messageId === undefined || target?.kind === "outbox" || target?.kind === "drafts") {
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

  return { body, detail, loadingDetail }
}

export { useMessageDetail, type MessageDetailOptions }
