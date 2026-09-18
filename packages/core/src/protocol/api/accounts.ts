import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

import { AccountConfig, SyncConfig } from "../../config/schema"
import { AccountId } from "../../ids"
import { AccountSave, DiscoveryResult, NewAccount } from "../accounts"
import {
  AccountNotFoundError,
  CredentialsError,
  InternalError,
  InvalidRequestError,
} from "./errors"

const discover = HttpApiEndpoint.post("account.discover", "/api/accounts/discover", {
  payload: Schema.Struct({ email: Schema.String }),
  success: DiscoveryResult,
  error: [InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "account.discover",
    summary: "Discover account servers",
    description: "Resolve IMAP and SMTP server settings for an email address.",
  }),
)

const create = HttpApiEndpoint.post("account.create", "/api/accounts", {
  payload: NewAccount,
  success: AccountConfig,
  error: [InvalidRequestError, CredentialsError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "account.create",
    summary: "Create account",
    description: "Create a new account from its configuration.",
  }),
)

const update = HttpApiEndpoint.put("account.update", "/api/accounts/:accountId", {
  params: { accountId: AccountId },
  payload: AccountSave,
  success: AccountConfig,
  error: [AccountNotFoundError, InvalidRequestError, CredentialsError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "account.update",
    summary: "Update account",
    description: "Replace the saved configuration of an existing account.",
  }),
)

const username = HttpApiEndpoint.get("account.username", "/api/accounts/:accountId/username", {
  params: { accountId: AccountId },
  success: Schema.NullOr(Schema.String),
  error: [AccountNotFoundError, InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "account.username",
    summary: "Get account username",
    description: "Return the login username for an account when it is known.",
  }),
)

const saveSyncSettings = HttpApiEndpoint.put("account.saveSyncSettings", "/api/sync-settings", {
  payload: SyncConfig,
  success: Schema.Void,
  error: [InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "account.saveSyncSettings",
    summary: "Save sync settings",
    description: "Replace the persisted sync settings.",
  }),
)

const AccountGroup = HttpApiGroup.make("accounts").add(
  discover,
  create,
  update,
  username,
  saveSyncSettings,
)

export { AccountGroup }
