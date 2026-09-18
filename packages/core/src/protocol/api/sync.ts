import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

import { AccountId } from "../../ids"
import { SyncReport } from "../mail"
import { InternalError, InvalidRequestError } from "./errors"

const run = HttpApiEndpoint.post("sync.run", "/api/sync", {
  payload: Schema.Struct({
    paths: Schema.optionalKey(Schema.Array(Schema.String)),
    accountId: Schema.optionalKey(AccountId),
  }),
  success: Schema.Array(SyncReport),
  error: [InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "sync.run",
    summary: "Run sync",
    description: "Synchronize accounts, optionally restricted to paths or an account.",
  }),
)

const SyncGroup = HttpApiGroup.make("sync").add(run)

export { SyncGroup }
