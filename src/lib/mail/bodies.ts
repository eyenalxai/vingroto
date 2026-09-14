import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import PostalMime from "postal-mime"

import type { AccountConfig } from "@/lib/config/schema"
import type { ImapServiceError } from "@/lib/mail/imap-types"
import type { MessageBody } from "@/lib/store/messages"

import { Database } from "@/lib/db/database"
import { describeError } from "@/lib/errors"
import { Imap } from "@/lib/mail/imap"
import { getMessageBody, storeMessageBody } from "@/lib/store/messages"

class BodyParseError extends Schema.TaggedError<BodyParseError>()("BodyParseError", {
  message: Schema.String,
}) {}

interface BodyRequest {
  readonly account: AccountConfig
  readonly mailboxPath: string
  readonly messageId: number
  readonly uid: number
}

interface MessageBodiesShape {
  readonly load: (
    request: BodyRequest,
  ) => Effect.Effect<MessageBody, ImapServiceError | BodyParseError | EffectDrizzleQueryError>
}

const decodeSource = (source: Buffer) =>
  Effect.tryPromise({
    try: async () => {
      const parsed = await PostalMime.parse(source)
      return {
        text: parsed.text ?? null,
        html: parsed.html ?? null,
        attachments: parsed.attachments.length,
      }
    },
    catch: (cause) => new BodyParseError({ message: describeError(cause) }),
  })

class MessageBodies extends Context.Service<MessageBodies, MessageBodiesShape>()(
  "vingroto/lib/mail/MessageBodies",
) {
  static readonly layer = Layer.effect(
    MessageBodies,
    Effect.gen(function* makeMessageBodies() {
      const database = yield* Database
      const imap = yield* Imap

      const load = Effect.fn("MessageBodies.load")(function* loadBody(request: BodyRequest) {
        const annotations = {
          account: request.account.id,
          mailbox: request.mailboxPath,
          uid: request.uid,
        }
        const cached = yield* getMessageBody(request.messageId)
        if (cached !== undefined) {
          yield* Effect.logDebug("body read from the cache").pipe(Effect.annotateLogs(annotations))
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
        const parsed = yield* decodeSource(source)
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
      })

      return MessageBodies.of({
        load: (request) =>
          load(request).pipe(
            Effect.provideService(Database, database),
            Effect.provideService(Imap, imap),
          ),
      })
    }),
  )
}

export { MessageBodies, type BodyRequest, type MessageBodiesShape }
