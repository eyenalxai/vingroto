import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { AppConfig, AuthMethod, OAuthConfig, ServerConfig } from "../config/schema"

const AccountSave = Schema.Struct({
  label: Schema.String,
  name: Schema.optionalKey(Schema.String),
  saveSent: Schema.Boolean.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true))),
  imap: ServerConfig,
  smtp: ServerConfig,
  auth: Schema.optionalKey(AuthMethod),
  oauth: Schema.optionalKey(OAuthConfig),
  username: Schema.String,
  password: Schema.optionalKey(Schema.String),
})

type AccountSave = typeof AccountSave.Type

const NewAccount = Schema.Struct({
  ...AccountSave.fields,
  email: Schema.String,
  password: Schema.optionalKey(Schema.String),
})

type NewAccount = typeof NewAccount.Type

const DiscoveredServers = Schema.Struct({
  imap: ServerConfig,
  smtp: ServerConfig,
  username: Schema.optionalKey(Schema.String),
  source: Schema.String,
})

type DiscoveredServers = typeof DiscoveredServers.Type

const DiscoveryResult = Schema.Union([
  Schema.TaggedStruct("found", { servers: DiscoveredServers }),
  Schema.TaggedStruct("not-found", { attempts: Schema.Array(Schema.String) }),
]).pipe(Schema.toTaggedUnion("_tag"))

type DiscoveryResult = typeof DiscoveryResult.Type

const ConfigState = Schema.Union([
  Schema.TaggedStruct("ok", { config: AppConfig }),
  Schema.TaggedStruct("empty", {}),
  Schema.TaggedStruct("error", { message: Schema.String }),
]).pipe(Schema.toTaggedUnion("_tag"))

type ConfigState = typeof ConfigState.Type

const ServerStatus = Schema.Struct({
  version: Schema.String,
  pid: Schema.Int,
  startedAt: Schema.Int,
  config: ConfigState,
  database: Schema.Union([
    Schema.TaggedStruct("ok", {}),
    Schema.TaggedStruct("error", { message: Schema.String }),
  ]).pipe(Schema.toTaggedUnion("_tag")),
})

type ServerStatus = typeof ServerStatus.Type

export { AccountSave, ConfigState, DiscoveredServers, DiscoveryResult, NewAccount, ServerStatus }
