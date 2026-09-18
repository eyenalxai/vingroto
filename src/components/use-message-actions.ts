import { Effect } from "effect"

import type { AppConfig } from "@/lib/config/schema"
import type { MessageActionRequest } from "@/lib/mail/actions"
import type { AppRuntime } from "@/lib/runtime"
import type { MailboxRow } from "@/lib/store/mailboxes"
import type { MessageListItem } from "@/lib/store/messages"

import { MailActions } from "@/lib/mail/actions"

interface MessageActionsOptions {
  readonly runtime: AppRuntime
  readonly config: () => AppConfig | undefined
  readonly selectedMessage: () => MessageListItem | undefined
  readonly taggedMessages: () => readonly MessageListItem[]
  readonly onChanged: (affected: number) => void
  readonly onStatus: (status: string) => void
}

interface TargetGroup {
  readonly accountId: string
  readonly messages: readonly MessageListItem[]
}

const toRequest = (message: MessageListItem): MessageActionRequest => {
  return { messageId: message.id, mailboxPath: message.mailboxPath, uid: message.uid }
}

const groupByAccount = (messages: readonly MessageListItem[]): readonly TargetGroup[] => {
  const groups = new Map<string, MessageListItem[]>()
  for (const message of messages) {
    const bucket = groups.get(message.accountId)
    if (bucket === undefined) {
      groups.set(message.accountId, [message])
      continue
    }
    bucket.push(message)
  }
  return [...groups].map(([accountId, entries]) => {
    return { accountId, messages: entries }
  })
}

const useMessageActions = (options: MessageActionsOptions) => {
  const targets = () => {
    const tagged = options.taggedMessages()
    if (tagged.length > 0) {
      return tagged
    }
    const selected = options.selectedMessage()
    return selected === undefined ? [] : [selected]
  }

  const applySeen = (items: readonly MessageListItem[], seen: boolean) => {
    const groups = groupByAccount(items)
    const program = Effect.gen(function* updateSeen() {
      const actions = yield* MailActions
      let affected = 0
      const errors: string[] = []
      for (const group of groups) {
        const account = options.config()?.accounts.find((entry) => entry.id === group.accountId)
        if (account === undefined) {
          errors.push(`account ${group.accountId} is not configured`)
          continue
        }
        const outcome = yield* actions.setSeen(
          account,
          group.messages.map((message) => toRequest(message)),
          seen,
        )
        affected += outcome.affected
        errors.push(...outcome.errors)
      }
      yield* Effect.sync(() => {
        const label = seen ? "read" : "unread"
        if (errors.length === 0) {
          options.onStatus(`marked ${affected} message(s) as ${label}`)
        } else {
          options.onStatus(
            `marked ${affected} as ${label} · ${errors.length} failed · ${errors[0]}`,
          )
        }
        options.onChanged(affected)
      })
    })
    options.runtime.runFork(program)
  }

  const toggleSeen = () => {
    const items = targets()
    if (items.length === 0) {
      options.onStatus("no message selected")
      return
    }
    applySeen(items, !items.every((item) => item.seen))
  }

  const move = (target: MailboxRow) => {
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
    const account = options.config()?.accounts.find((entry) => entry.id === target.account_id)
    if (account === undefined) {
      options.onStatus(`account ${target.account_id} is not configured`)
      return
    }
    const program = Effect.gen(function* moveToMailbox() {
      const actions = yield* MailActions
      const outcome = yield* actions.move(
        account,
        items.map((item) => toRequest(item)),
        target.path,
      )
      yield* Effect.sync(() => {
        const parts = [`moved ${outcome.moved} message(s) to ${target.name}`]
        if (outcome.skipped > 0) {
          parts.push(`${outcome.skipped} already there`)
        }
        if (outcome.errors.length > 0) {
          parts.push(`${outcome.errors.length} failed · ${outcome.errors[0]}`)
        }
        options.onStatus(parts.join(" · "))
        options.onChanged(outcome.moved)
      })
    })
    options.runtime.runFork(program)
  }

  return { move, targets, toggleSeen }
}

export { useMessageActions, type MessageActionsOptions }
