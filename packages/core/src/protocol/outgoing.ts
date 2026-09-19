import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { AccountId, DraftId, OutboxId } from "../ids"
import { MailAddress } from "../mail/address"
import { withDefault } from "./api/defaults"

const OutgoingMessage = Schema.Struct({
  accountId: AccountId,
  to: Schema.Array(MailAddress),
  cc: Schema.Array(MailAddress).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.sync((): readonly MailAddress[] => [])),
  ),
  bcc: Schema.Array(MailAddress).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.sync((): readonly MailAddress[] => [])),
  ),
  subject: withDefault(Schema.String, ""),
  body: withDefault(Schema.String, ""),
  inReplyTo: Schema.optionalKey(Schema.String),
  references: Schema.Array(Schema.String).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.sync((): readonly string[] => [])),
  ),
})

type OutgoingMessage = typeof OutgoingMessage.Type

const OutboxEntry = Schema.Struct({
  id: OutboxId,
  accountId: AccountId,
  to: Schema.Array(MailAddress),
  cc: Schema.Array(MailAddress),
  bcc: Schema.Array(MailAddress),
  subject: Schema.String,
  body: Schema.String,
  inReplyTo: Schema.NullOr(Schema.String),
  references: Schema.Array(Schema.String),
  createdAt: Schema.Int,
  sendAt: Schema.Int,
  attempts: Schema.Int,
  state: Schema.Literals(["pending", "failed"]),
  lastError: Schema.NullOr(Schema.String),
})

type OutboxEntry = typeof OutboxEntry.Type

const Draft = Schema.Struct({
  id: DraftId,
  accountId: AccountId,
  to: Schema.Array(MailAddress),
  cc: Schema.Array(MailAddress),
  bcc: Schema.Array(MailAddress),
  subject: Schema.String,
  body: Schema.String,
  inReplyTo: Schema.NullOr(Schema.String),
  references: Schema.Array(Schema.String),
  createdAt: Schema.Int,
  updatedAt: Schema.Int,
})

type Draft = typeof Draft.Type

const DraftSave = Schema.Struct({
  ...OutgoingMessage.fields,
  draftId: Schema.optionalKey(DraftId),
})

type DraftSave = typeof DraftSave.Type

export { Draft, DraftSave, OutgoingMessage, OutboxEntry }
