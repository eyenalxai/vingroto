import type { MailboxId, MessageId } from "@vingroto/core/ids"
import type {
  ListScope,
  MessageDetail,
  MessageListItem,
  MoveOutcome,
} from "@vingroto/core/protocol/mail"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type { ConfigInvalid, ConfigUnreadable } from "@/lib/config/load"
import type { MessageActionError } from "@/lib/mail/actions"

import { Database } from "@/lib/db/database"
import { MailActions } from "@/lib/mail/actions"
import { listMessagesForScope } from "@/lib/store/message-views"
import { getMessage } from "@/lib/store/messages"

interface MessagesShape {
  readonly list: (
    scope: ListScope,
    limit: number,
  ) => Effect.Effect<readonly MessageListItem[], EffectDrizzleQueryError>
  readonly get: (
    messageId: MessageId,
  ) => Effect.Effect<MessageDetail | undefined, EffectDrizzleQueryError>
  readonly move: (
    ids: readonly MessageId[],
    targetMailboxId: MailboxId,
  ) => Effect.Effect<
    MoveOutcome,
    MessageActionError | ConfigInvalid | ConfigUnreadable | EffectDrizzleQueryError
  >
}

class Messages extends Context.Service<Messages, MessagesShape>()(
  "vingroto/lib/messages/Messages",
) {
  static readonly layer = Layer.effect(
    Messages,
    Effect.gen(function* makeMessages() {
      const database = yield* Database
      const actions = yield* MailActions

      const list = Effect.fn("Messages.list")(
        function* listMessages(scope: ListScope, limit: number) {
          return yield* listMessagesForScope(scope, limit)
        },
        Effect.provideService(Database, database),
      )

      const get = Effect.fn("Messages.get")(
        function* getMessageDetail(messageId: MessageId) {
          return yield* getMessage(messageId)
        },
        Effect.provideService(Database, database),
      )

      const move = Effect.fn("Messages.move")(function* moveMessages(
        ids: readonly MessageId[],
        targetMailboxId: MailboxId,
      ) {
        return yield* actions.moveByIds(ids, targetMailboxId)
      })

      return Messages.of({ get, list, move })
    }),
  )
}

export { Messages, type MessagesShape }
