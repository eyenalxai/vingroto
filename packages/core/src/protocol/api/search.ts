import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

import { AccountId, MailboxId } from "../../ids"
import { MessageTarget, SearchOutcome } from "../mail"
import { InternalError, InvalidRequestError } from "./errors"

const scopeQuery = {
  scope: Schema.Literals(["all", "unread", "mailbox"]),
  accountId: Schema.optionalKey(AccountId),
  mailboxId: Schema.optionalKey(MailboxId),
  query: Schema.String,
}

const messages = HttpApiEndpoint.get("search.messages", "/api/search/messages", {
  query: {
    ...scopeQuery,
    limit: Schema.Int,
  },
  success: SearchOutcome,
  error: [InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "search.messages",
    summary: "Search messages",
    description:
      "Filter the given list scope with fuzzy local matches and the remote hits found so far.",
  }),
)

const marks = HttpApiEndpoint.get("search.marks", "/api/search/marks", {
  query: { ...scopeQuery },
  success: Schema.Array(MessageTarget),
  error: [InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "search.marks",
    summary: "List every search match",
    description: "Return the routing info of every known match so a client can mark them all.",
  }),
)

const start = HttpApiEndpoint.post("search.start", "/api/search/start", {
  payload: Schema.Struct({ ...scopeQuery }),
  success: Schema.Void,
  error: [InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "search.start",
    summary: "Start remote search",
    description: "Run or advance the remote IMAP search for the query in the given list scope.",
  }),
)

const SearchGroup = HttpApiGroup.make("search").add(messages, marks, start)

export { SearchGroup }
