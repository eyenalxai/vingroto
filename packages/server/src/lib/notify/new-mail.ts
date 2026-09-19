import type { AccountConfig } from "@vingroto/core/config/schema"

import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import { formatNewMailNotification } from "@vingroto/core/mail/notification"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"

import type { MailboxRow } from "@/lib/store/mailboxes"

import { loadConfigFile } from "@/lib/config/load"
import { Database } from "@/lib/db/database"
import { ServerEvents } from "@/lib/events"
import { DesktopNotifications } from "@/lib/notify/desktop"
import { listMessages } from "@/lib/store/messages"

interface StoredMail {
  readonly account: AccountConfig
  readonly mailbox: MailboxRow
  readonly stored: number
  readonly reset: boolean
}

interface NewMailNotifierShape {
  readonly mailboxStored: (input: StoredMail) => Effect.Effect<void>
}

class NewMailNotifier extends Context.Service<NewMailNotifier, NewMailNotifierShape>()(
  "@vingroto/server/lib/notify/new-mail/NewMailNotifier",
) {
  static readonly layer = Layer.effect(
    NewMailNotifier,
    Effect.gen(function* makeNewMailNotifier() {
      const paths = yield* AppPaths
      const fs = yield* FileSystem.FileSystem
      const events = yield* ServerEvents
      const desktop = yield* DesktopNotifications
      const database = yield* Database

      const announce = Effect.fn("NewMailNotifier.announce")(function* announceStoredMail(
        input: StoredMail,
      ) {
        if (
          input.stored === 0 ||
          input.reset ||
          input.mailbox.muted ||
          input.mailbox.synced_at === null
        ) {
          return
        }
        const subscribers = yield* events.subscribers
        if (subscribers > 0) {
          return
        }
        const config = yield* loadConfigFile(paths.config, fs)
        if (!config.notifications.enabled) {
          return
        }
        const newest = (yield* listMessages(input.mailbox.id, 1).pipe(
          Effect.provideService(Database, database),
        ))[0]
        if (newest === undefined) {
          return
        }
        yield* desktop.notify(
          formatNewMailNotification({
            accountLabel: config.accounts.length > 1 ? input.account.label : undefined,
            fromAddress: newest.fromAddress,
            fromName: newest.fromName,
            mailboxName: input.mailbox.name,
            subject: newest.subject,
          }),
        )
      })

      const mailboxStored = Effect.fn("NewMailNotifier.mailboxStored")(function* notifyStoredMail(
        input: StoredMail,
      ) {
        yield* announce(input).pipe(
          Effect.catch((error) =>
            Effect.logDebug("new mail notification skipped").pipe(
              Effect.annotateLogs({
                mailbox: input.mailbox.path,
                reason: describeError(error),
              }),
            ),
          ),
        )
      })

      return NewMailNotifier.of({ mailboxStored })
    }),
  )
}

export { NewMailNotifier, type NewMailNotifierShape }
