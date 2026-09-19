import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

import { DraftId, OutboxId } from "../../ids"
import { OutboxEntry, OutgoingMessage } from "../outgoing"
import {
  AccountNotFoundError,
  InternalError,
  InvalidRequestError,
  OutboxNotFoundError,
} from "./errors"

const enqueue = HttpApiEndpoint.post("outbox.enqueue", "/api/outbox", {
  payload: Schema.Struct({ ...OutgoingMessage.fields, draftId: Schema.optionalKey(DraftId) }),
  success: OutboxEntry,
  error: [AccountNotFoundError, InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "outbox.enqueue",
    summary: "Enqueue a message",
    description: "Accept a message into the outbox, deleting the draft it was sent from.",
  }),
)

const list = HttpApiEndpoint.get("outbox.list", "/api/outbox", {
  success: Schema.Array(OutboxEntry),
  error: [InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "outbox.list",
    summary: "List the outbox",
    description: "List the messages waiting in the outbox, oldest first.",
  }),
)

const cancel = HttpApiEndpoint.post("outbox.cancel", "/api/outbox/:outboxId/cancel", {
  params: { outboxId: OutboxId },
  success: Schema.Void,
  error: [OutboxNotFoundError, InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "outbox.cancel",
    summary: "Cancel a pending message",
    description: "Move a message out of the outbox and into drafts.",
  }),
)

const release = HttpApiEndpoint.post("outbox.release", "/api/outbox/:outboxId/release", {
  params: { outboxId: OutboxId },
  success: OutboxEntry,
  error: [OutboxNotFoundError, InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "outbox.release",
    summary: "Release a message now",
    description: "Send a message on the next worker pass and reset its retry backoff.",
  }),
)

const OutboxGroup = HttpApiGroup.make("outbox").add(enqueue, list, cancel, release)

export { OutboxGroup }
