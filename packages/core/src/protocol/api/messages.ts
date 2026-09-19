import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

import { AccountId, MailboxId, MessageId } from "../../ids"
import { MessageBody, MessageDetail, MessageListItem, MoveOutcome, SeenOutcome } from "../mail"
import { withDefault, withQueryDefault } from "./defaults"
import {
  InternalError,
  InvalidRequestError,
  MailboxNotFoundError,
  MessageNotFoundError,
} from "./errors"

const ListScope = Schema.Literals(["all", "unread", "mailbox"])

const list = HttpApiEndpoint.get("message.list", "/api/messages", {
  query: {
    scope: withQueryDefault(ListScope, "all"),
    accountId: Schema.optionalKey(AccountId),
    mailboxId: Schema.optionalKey(MailboxId),
    limit: withQueryDefault(
      Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(1000)),
      100,
    ),
  },
  success: Schema.Array(MessageListItem),
  error: [InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "message.list",
    summary: "List messages",
    description: "List messages for the given scope, optionally limited to an account or mailbox.",
  }),
)

const get = HttpApiEndpoint.get("message.get", "/api/messages/:messageId", {
  params: { messageId: MessageId },
  success: MessageDetail,
  error: [MessageNotFoundError, InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "message.get",
    summary: "Get message detail",
    description: "Return the full metadata for a single message.",
  }),
)

const body = HttpApiEndpoint.get("message.body", "/api/messages/:messageId/body", {
  params: { messageId: MessageId },
  success: MessageBody,
  error: [MessageNotFoundError, InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "message.body",
    summary: "Load message body",
    description: "Return the text and html body of a single message.",
  }),
)

const setSeen = HttpApiEndpoint.post("message.setSeen", "/api/messages/seen", {
  payload: Schema.Struct({ ids: Schema.Array(MessageId), seen: withDefault(Schema.Boolean, true) }),
  success: SeenOutcome,
  error: [InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "message.setSeen",
    summary: "Set messages seen",
    description: "Mark or unmark a batch of messages as seen.",
  }),
)

const move = HttpApiEndpoint.post("message.move", "/api/messages/move", {
  payload: Schema.Struct({ ids: Schema.Array(MessageId), targetMailboxId: MailboxId }),
  success: MoveOutcome,
  error: [MailboxNotFoundError, InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "message.move",
    summary: "Move messages",
    description: "Move a batch of messages into the target mailbox.",
  }),
)

const MessageGroup = HttpApiGroup.make("messages").add(list, get, body, setSeen, move)

export { MessageGroup }
