import type { AccountConfig } from "@vingroto/core/config/schema"
import type { Mailbox } from "@vingroto/core/protocol/mail"

import { useRenderer } from "@opentui/solid"
import { describeError } from "@vingroto/core/errors"
import { formatNewMailNotification } from "@vingroto/core/mail/notification"
import { Cause, Effect, Exit } from "effect"

import type { AppRuntime } from "@/lib/runtime"

import { useTerminalFocus } from "@/components/use-terminal-focus"
import { MailClient } from "@/lib/api"
import { shouldAnnounceNewMail } from "@/lib/notifications"

interface NewMailNotificationsOptions {
  readonly runtime: AppRuntime
  readonly accounts: () => readonly AccountConfig[]
  readonly enabled: () => boolean
}

const useNewMailNotifications = (options: NewMailNotificationsOptions) => {
  const renderer = useRenderer()
  const focus = useTerminalFocus()

  const notify = (mailbox: Mailbox, visible: boolean) => {
    if (!shouldAnnounceNewMail(focus(), visible, mailbox, options.enabled())) {
      return
    }
    const program = Effect.gen(function* raiseNewMailNotification() {
      const exit = yield* Effect.exit(
        Effect.gen(function* announceNewestMessage() {
          const client = yield* MailClient
          const rows = yield* client.listMessages({ kind: "mailbox", mailboxId: mailbox.id }, 1)
          const newest = rows[0]
          if (newest === undefined) {
            return
          }
          const accountLabel =
            options.accounts().length > 1
              ? options.accounts().find((account) => account.id === mailbox.account_id)?.label
              : undefined
          const notification = formatNewMailNotification({
            accountLabel,
            fromAddress: newest.fromAddress,
            fromName: newest.fromName,
            mailboxName: mailbox.name,
            subject: newest.subject,
          })
          yield* Effect.sync(() => {
            renderer.triggerNotification(notification.message, notification.title)
          })
        }),
      )
      if (Exit.isFailure(exit)) {
        yield* Effect.logWarning("could not raise the new mail notification").pipe(
          Effect.annotateLogs({
            mailboxId: mailbox.id,
            reason: describeError(Cause.squash(exit.cause)),
          }),
        )
      }
    })
    options.runtime.runFork(program)
  }

  return { notify }
}

export { useNewMailNotifications, type NewMailNotificationsOptions }
