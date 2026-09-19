import * as Schema from "effect/Schema"

import { AccountId, DraftId, MailboxId, MessageId, OutboxId } from "../../ids"

class InvalidRequestError extends Schema.TaggedError<InvalidRequestError>()(
  "InvalidRequestError",
  {
    message: Schema.String,
    field: Schema.optionalKey(Schema.String),
  },
  { httpApiStatus: 400 },
) {}

class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 401 },
) {}

class MessageNotFoundError extends Schema.TaggedError<MessageNotFoundError>()(
  "MessageNotFoundError",
  {
    messageId: MessageId,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

class MailboxNotFoundError extends Schema.TaggedError<MailboxNotFoundError>()(
  "MailboxNotFoundError",
  {
    mailboxId: MailboxId,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

class OutboxNotFoundError extends Schema.TaggedError<OutboxNotFoundError>()(
  "OutboxNotFoundError",
  {
    outboxId: OutboxId,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

class DraftNotFoundError extends Schema.TaggedError<DraftNotFoundError>()(
  "DraftNotFoundError",
  {
    draftId: DraftId,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

class AccountNotFoundError extends Schema.TaggedError<AccountNotFoundError>()(
  "AccountNotFoundError",
  {
    accountId: AccountId,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

class CredentialsError extends Schema.TaggedError<CredentialsError>()(
  "CredentialsError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

class UpstreamError extends Schema.TaggedError<UpstreamError>()(
  "UpstreamError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 502 },
) {}

class InternalError extends Schema.TaggedError<InternalError>()(
  "InternalError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 500 },
) {}

class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  "NotFoundError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export {
  AccountNotFoundError,
  CredentialsError,
  DraftNotFoundError,
  InternalError,
  InvalidRequestError,
  MailboxNotFoundError,
  MessageNotFoundError,
  NotFoundError,
  OutboxNotFoundError,
  UnauthorizedError,
  UpstreamError,
}
