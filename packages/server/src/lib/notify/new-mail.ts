import type { AccountConfig } from "@vingroto/core/config/schema"
import type { NewestUnseen } from "@vingroto/core/protocol/events"
import type { Mailbox } from "@vingroto/core/protocol/mail"

import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import { formatNewMailNotification } from "@vingroto/core/mail/notification"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"

import { loadConfigFile } from "@/lib/config/load"
import { ServerEvents } from "@/lib/events"
import { DesktopNotifications } from "@/lib/notify/desktop"

interface StoredMail {
  readonly account: AccountConfig
  readonly mailbox: Mailbox
  readonly newestUnseen: NewestUnseen | null
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

      const announce = Effect.fn("NewMailNotifier.announce")(function* announceStoredMail(
        input: StoredMail,
      ) {
        if (input.newestUnseen === null || input.mailbox.muted || input.mailbox.syncedAt === null) {
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
        yield* desktop.notify(
          formatNewMailNotification({
            accountLabel: config.accounts.length > 1 ? input.account.label : undefined,
            fromAddress: input.newestUnseen.fromAddress,
            fromName: input.newestUnseen.fromName,
            mailboxName: input.mailbox.name,
            subject: input.newestUnseen.subject,
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
