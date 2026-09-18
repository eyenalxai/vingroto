import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

import { MailboxId } from "../../ids"
import { MailboxSnapshot } from "../mail"
import { InternalError, InvalidRequestError, MailboxNotFoundError } from "./errors"

const snapshot = HttpApiEndpoint.get("mailbox.snapshot", "/api/mailboxes", {
  success: MailboxSnapshot,
  error: InternalError,
}).annotateMerge(
  OpenApi.annotations({
    identifier: "mailbox.snapshot",
    summary: "List mailboxes",
    description: "Return every mailbox with its counts and the total unread count.",
  }),
)

const setMuted = HttpApiEndpoint.post("mailbox.setMuted", "/api/mailboxes/:mailboxId/muted", {
  params: { mailboxId: MailboxId },
  payload: Schema.Struct({ muted: Schema.Boolean }),
  success: Schema.Void,
  error: [MailboxNotFoundError, InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "mailbox.setMuted",
    summary: "Set mailbox muted",
    description: "Mute or unmute a single mailbox.",
  }),
)

const MailboxGroup = HttpApiGroup.make("mailboxes").add(snapshot, setMuted)

export { MailboxGroup }
