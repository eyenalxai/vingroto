import type { MessageId } from "@vingroto/core/ids"
import type { Mailbox, MessageListItem } from "@vingroto/core/protocol/mail"

import { Effect } from "effect"
import { createSignal } from "solid-js"

import type { MailClientError } from "@/lib/api"
import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

interface MessageActionsOptions {
  readonly runtime: AppRuntime
  readonly selectedMessage: () => MessageListItem | undefined
  readonly markedMessages: () => readonly MessageListItem[]
  readonly onChanged: (ids: readonly MessageId[]) => void
  readonly onStatus: (status: string) => void
  readonly onDisconnected: (message: string) => void
}

const useMessageActions = (options: MessageActionsOptions) => {
  const [pendingMessageIds, setPendingMessageIds] = createSignal<ReadonlySet<MessageId>>(new Set())

  const targets = () => {
    const marked = options.markedMessages()
    if (marked.length > 0) {
      return marked
    }
    const selected = options.selectedMessage()
    return selected === undefined ? [] : [selected]
  }

  const reportFailure = (label: string, error: MailClientError) => {
    const failure = describeClientFailure(error)
    if (failure._tag === "connection") {
      options.onDisconnected(failure.message)
      return
    }
    options.onStatus(`${label} · ${failure.message}`)
  }

  const addPending = (ids: readonly MessageId[]) => {
    setPendingMessageIds((current) => {
      const next = new Set(current)
      for (const id of ids) {
        next.add(id)
      }
      return next
    })
  }

  const removePending = (ids: readonly MessageId[]) => {
    setPendingMessageIds((current) => {
      const next = new Set(current)
      for (const id of ids) {
        next.delete(id)
      }
      return next
    })
  }

  const applySeen = (items: readonly MessageListItem[], seen: boolean) => {
    const targetIds = items.map((item) => item.id)
    addPending(targetIds)
    const program = Effect.gen(function* updateSeen() {
      const client = yield* MailClient
      const result = yield* client.setSeen(targetIds, seen).pipe(Effect.result)
      yield* Effect.sync(() => {
        const label = seen ? "read" : "unread"
        if (result._tag === "Failure") {
          reportFailure("could not update the messages", result.failure)
          return
        }
        const outcome = result.success
        if (outcome.errors.length === 0) {
          options.onStatus(`marked ${outcome.affected} message(s) as ${label}`)
        } else {
          options.onStatus(
            `marked ${outcome.affected} as ${label} · ${outcome.errors.length} failed · ${outcome.errors[0]}`,
          )
        }
        if (outcome.affected > 0) {
          options.onChanged(targetIds)
        }
      })
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          removePending(targetIds)
        }),
      ),
    )
    options.runtime.runFork(program)
  }

  const markRead = () => {
    const items = targets()
    if (items.length === 0) {
      options.onStatus("no message selected")
      return
    }
    applySeen(items, true)
  }

  const markUnread = () => {
    const items = targets()
    if (items.length === 0) {
      options.onStatus("no message selected")
      return
    }
    applySeen(items, false)
  }

  const move = (target: Mailbox) => {
    const items = targets()
    if (items.length === 0) {
      options.onStatus("no message selected")
      return
    }
    const accountIds = new Set(items.map((item) => item.accountId))
    if (accountIds.size !== 1) {
      options.onStatus("select messages from one account to move them")
      return
    }
    const targetIds = items.map((item) => item.id)
    addPending(targetIds)
    const program = Effect.gen(function* moveToMailbox() {
      const client = yield* MailClient
      const result = yield* client.moveMessages(targetIds, target.id).pipe(Effect.result)
      yield* Effect.sync(() => {
        if (result._tag === "Failure") {
          reportFailure("could not move the messages", result.failure)
          return
        }
        const outcome = result.success
        const parts = [`moved ${outcome.moved} message(s) to ${target.name}`]
        if (outcome.skipped > 0) {
          parts.push(`${outcome.skipped} already there`)
        }
        if (outcome.errors.length > 0) {
          parts.push(`${outcome.errors.length} failed · ${outcome.errors[0]}`)
        }
        options.onStatus(parts.join(" · "))
        if (outcome.moved > 0) {
          options.onChanged(targetIds)
        }
      })
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          removePending(targetIds)
        }),
      ),
    )
    options.runtime.runFork(program)
  }

  return { markRead, markUnread, move, pendingMessageIds, targets }
}

export { useMessageActions, type MessageActionsOptions }
