import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

import { DraftId } from "../../ids"
import { Draft, DraftSave } from "../outgoing"
import {
  AccountNotFoundError,
  DraftNotFoundError,
  InternalError,
  InvalidRequestError,
} from "./errors"

const save = HttpApiEndpoint.post("draft.save", "/api/drafts", {
  payload: DraftSave,
  success: Draft,
  error: [AccountNotFoundError, InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "draft.save",
    summary: "Save a draft",
    description: "Create or replace a message stored by the daemon as a draft.",
  }),
)

const list = HttpApiEndpoint.get("draft.list", "/api/drafts", {
  success: Schema.Array(Draft),
  error: [InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "draft.list",
    summary: "List drafts",
    description: "List the daemon's stored drafts, most recently edited first.",
  }),
)

const remove = HttpApiEndpoint.delete("draft.delete", "/api/drafts/:draftId", {
  params: { draftId: DraftId },
  success: Schema.Void,
  error: [DraftNotFoundError, InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "draft.delete",
    summary: "Delete a draft",
    description: "Discard a stored draft.",
  }),
)

const DraftGroup = HttpApiGroup.make("drafts").add(save, list, remove)

export { DraftGroup }
