import type { MessageId } from "@vingroto/core/ids"
import type { MessageDetail, MessageListItem } from "@vingroto/core/protocol/mail"
import type { Setter } from "solid-js"

import { Effect } from "effect"

import type { MailClientError } from "@/lib/api"
import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"
import { summarizeActionFailures } from "@/lib/mail/failure-text"
import { parseListKey } from "@/lib/mail/mailbox-tree"
import { reconcileRows } from "@/lib/rows"

const compareMessageRows = (left: MessageListItem, right: MessageListItem): number => {
  if (left.date !== right.date) {
    if (left.date === null) {
      return 1
    }
    if (right.date === null) {
      return -1
    }
    return right.date - left.date
  }
  return right.uid - left.uid
}

interface ReadOnDisplayOptions {
  readonly runtime: AppRuntime
  readonly listKey: () => string | undefined
  readonly onStatus: (status: string) => void
  readonly onDisconnected: (message: string) => void
  readonly messages: () => readonly MessageListItem[]
  readonly detail: () => MessageDetail | undefined
  readonly selectedMessageId: () => MessageId | undefined
  readonly setMessages: Setter<readonly MessageListItem[]>
  readonly setSelectedMessageId: Setter<MessageId | undefined>
}

const useReadOnDisplay = (options: ReadOnDisplayOptions) => {
  const retainedRows = new Map<MessageId, MessageListItem>()
  const pendingReadIds = new Set<MessageId>()

  const isUnreadScope = () => parseListKey(options.listKey())?.kind === "unread"

  const reportFailure = (label: string, error: MailClientError) => {
    const failure = describeClientFailure(error)
    if (failure._tag === "connection") {
      options.onDisconnected(failure.message)
      return
    }
    options.onStatus(`${label} · ${failure.message}`)
  }

  const mergeRows = (rows: readonly MessageListItem[]): readonly MessageListItem[] => {
    if (!isUnreadScope() || retainedRows.size === 0) {
      return rows
    }
    const present = new Set(rows.map((row) => row.id))
    for (const id of present) {
      retainedRows.delete(id)
    }
    const missing = [...retainedRows.values()].filter((row) => !present.has(row.id))
    if (missing.length === 0) {
      return rows
    }
    return [...rows, ...missing].toSorted(compareMessageRows)
  }

  const applyMessageRows = (rows: readonly MessageListItem[]) => {
    const previous = options.messages()
    const merged = mergeRows(rows)
    options.setMessages(reconcileRows(previous, merged, (row) => row.id))
    const current = options.selectedMessageId()
    if (current !== undefined && pendingReadIds.has(current)) {
      return
    }
    if (merged.some((row) => row.id === current)) {
      return
    }
    const previousIndex = previous.findIndex((row) => row.id === current)
    const index = Math.min(Math.max(previousIndex, 0), merged.length - 1)
    options.setSelectedMessageId(merged[index]?.id)
  }

  const applyReadOnDisplay = (messageId: MessageId) => {
    if (pendingReadIds.has(messageId) || options.selectedMessageId() !== messageId) {
      return
    }
    const row = options.messages().find((entry) => entry.id === messageId)
    if (row?.seen === true || options.detail()?.seen === true) {
      return
    }
    const displayedRow: MessageListItem | undefined = row ?? options.detail()
    const listKey = options.listKey()
    pendingReadIds.add(messageId)
    const program = Effect.gen(function* markDisplayedMessageRead() {
      const client = yield* MailClient
      const result = yield* client.setSeen([messageId], true).pipe(Effect.result)
      yield* Effect.sync(() => {
        if (result._tag === "Failure") {
          reportFailure("could not mark the message as read", result.failure)
          return
        }
        const outcome = result.success
        if (outcome.errors.length > 0) {
          options.onStatus(
            `marked ${outcome.affected} as read · ${summarizeActionFailures(outcome.errors)}`,
          )
        }
        if (outcome.affected === 0) {
          return
        }
        const entry = displayedRow === undefined ? undefined : { ...displayedRow, seen: true }
        const canRetain = options.listKey() === listKey && isUnreadScope()
        if (entry !== undefined && canRetain) {
          retainedRows.set(messageId, entry)
        }
        options.setMessages((current) => {
          const index = current.findIndex((item) => item.id === messageId)
          if (index === -1) {
            if (entry === undefined || !canRetain) {
              return current
            }
            return [...current, entry].toSorted(compareMessageRows)
          }
          const existing = current[index]
          if (existing === undefined || existing.seen) {
            return current
          }
          const next = [...current]
          next[index] = { ...existing, seen: true }
          return next
        })
      })
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          pendingReadIds.delete(messageId)
        }),
      ),
    )
    options.runtime.runFork(program)
  }

  const dropRetained = (ids: readonly MessageId[]) => {
    for (const id of ids) {
      retainedRows.delete(id)
    }
  }

  const reset = () => {
    retainedRows.clear()
  }

  return { applyMessageRows, applyReadOnDisplay, dropRetained, reset }
}

export { useReadOnDisplay, type ReadOnDisplayOptions }
