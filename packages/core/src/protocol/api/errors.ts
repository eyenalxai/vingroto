import * as Schema from "effect/Schema"

import { AccountId, MailboxId, MessageId } from "../../ids"

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

export {
  AccountNotFoundError,
  CredentialsError,
  InternalError,
  InvalidRequestError,
  MailboxNotFoundError,
  MessageNotFoundError,
  UnauthorizedError,
  UpstreamError,
}
