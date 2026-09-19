import type { AccountConfig } from "@vingroto/core/config/schema"
import type { Uid } from "@vingroto/core/ids"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { AppPaths } from "@vingroto/core/app-paths"
import { AccountId, MessageId } from "@vingroto/core/ids"
import * as Cache from "effect/Cache"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Hash from "effect/Hash"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type { ConfigInvalid, ConfigUnreadable } from "@/lib/config/load"
import type { ImapServiceError } from "@/lib/mail/imap-types"
import type { BodyParseError } from "@/lib/mail/parse"
import type { MessageBody } from "@/lib/store/bodies"

import { loadConfig } from "@/lib/config/load"
import { Database } from "@/lib/db/database"
import { Imap } from "@/lib/mail/imap"
import { parseMessageSource } from "@/lib/mail/parse"
import { getMessageBody, storeMessageBody } from "@/lib/store/bodies"
import { getMessage } from "@/lib/store/messages"

class MessageNotFound extends Schema.TaggedError<MessageNotFound>()("MessageNotFound", {
  messageId: MessageId,
  message: Schema.String,
}) {}

class AccountNotConfigured extends Schema.TaggedError<AccountNotConfigured>()(
  "AccountNotConfigured",
  {
    accountId: AccountId,
    message: Schema.String,
  },
) {}

interface BodyRequest {
  readonly account: AccountConfig
  readonly mailboxPath: string
  readonly messageId: MessageId
  readonly uid: Uid
}

type MessageBodyError = ImapServiceError | BodyParseError | EffectDrizzleQueryError

interface MessageBodiesShape {
  readonly load: (request: BodyRequest) => Effect.Effect<MessageBody, MessageBodyError>
  readonly loadById: (
    messageId: MessageId,
  ) => Effect.Effect<
    MessageBody,
    MessageBodyError | MessageNotFound | AccountNotConfigured | ConfigInvalid | ConfigUnreadable
  >
}

const bodyCacheCapacity = 256
const bodyTimeToLive = Duration.minutes(1)

class BodyLoadKey implements Equal.Equal {
  readonly request: BodyRequest

  constructor(request: BodyRequest) {
    this.request = request
  }

  [Equal.symbol](that: Equal.Equal): boolean {
    return that instanceof BodyLoadKey && this.request.messageId === that.request.messageId
  }

  [Hash.symbol](): number {
    return Hash.number(this.request.messageId)
  }
}

class MessageBodies extends Context.Service<MessageBodies, MessageBodiesShape>()(
  "vingroto/lib/mail/MessageBodies",
) {
  static readonly layer = Layer.effect(
    MessageBodies,
    Effect.gen(function* makeMessageBodies() {
      const database = yield* Database
      const imap = yield* Imap
      const paths = yield* AppPaths
      const fs = yield* FileSystem.FileSystem

      const loadFromSource = Effect.fn("MessageBodies.loadFromSource")(
        function* loadBody(request: BodyRequest) {
          const annotations = {
            account: request.account.id,
            mailbox: request.mailboxPath,
            uid: request.uid,
          }
          const cached = yield* getMessageBody(request.messageId)
          if (cached !== undefined) {
            yield* Effect.logDebug("body read from the cache").pipe(
              Effect.annotateLogs(annotations),
            )
            return { text: cached.text, html: cached.html }
          }
          yield* Effect.logDebug("body cache miss, downloading").pipe(
            Effect.annotateLogs(annotations),
          )
          const source = yield* imap.fetchMessageSource(
            request.account,
            request.mailboxPath,
            request.uid,
          )
          const parsed = yield* parseMessageSource(source)
          const body: MessageBody = { text: parsed.text, html: parsed.html }
          yield* storeMessageBody(request.messageId, body, parsed.attachments > 0)
          yield* Effect.logInfo("body cached").pipe(
            Effect.annotateLogs({
              ...annotations,
              bytes: source.length,
              attachments: parsed.attachments,
            }),
          )
          return body
        },
        Effect.provideService(Database, database),
        Effect.provideService(Imap, imap),
      )

      const bodies = yield* Cache.makeWith((key: BodyLoadKey) => loadFromSource(key.request), {
        capacity: bodyCacheCapacity,
        timeToLive: (exit) => (Exit.isSuccess(exit) ? bodyTimeToLive : Duration.zero),
      })

      const load = Effect.fn("MessageBodies.load")(function* loadBody(request: BodyRequest) {
        return yield* Cache.get(bodies, new BodyLoadKey(request))
      })

      const loadById = Effect.fn("MessageBodies.loadById")(
        function* loadById(messageId: MessageId) {
          const message = yield* getMessage(messageId)
          if (message === undefined) {
            return yield* new MessageNotFound({
              messageId,
              message: `message ${messageId} was not found`,
            })
          }
          const config = yield* loadConfig()
          const account = config.accounts.find((entry) => entry.id === message.accountId)
          if (account === undefined) {
            return yield* new AccountNotConfigured({
              accountId: message.accountId,
              message: `account ${message.accountId} is not configured`,
            })
          }
          return yield* load({
            account,
            mailboxPath: message.mailboxPath,
            messageId,
            uid: message.uid,
          })
        },
        Effect.provideService(Database, database),
        Effect.provideService(AppPaths, paths),
        Effect.provideService(FileSystem.FileSystem, fs),
      )

      return MessageBodies.of({ load, loadById })
    }),
  )
}

export {
  AccountNotConfigured,
  MessageBodies,
  MessageNotFound,
  type BodyRequest,
  type MessageBodiesShape,
}
