import * as Schema from "effect/Schema"

import { AppConfig, ServerConfig } from "../config/schema"

const AccountSave = Schema.Struct({
  label: Schema.String,
  name: Schema.optionalKey(Schema.String),
  imap: ServerConfig,
  smtp: ServerConfig,
  username: Schema.String,
  password: Schema.optionalKey(Schema.String),
})

type AccountSave = Schema.Schema.Type<typeof AccountSave>

const NewAccount = Schema.Struct({
  ...AccountSave.fields,
  email: Schema.String,
  password: Schema.String,
})

type NewAccount = Schema.Schema.Type<typeof NewAccount>

const DiscoveredServers = Schema.Struct({
  imap: ServerConfig,
  smtp: ServerConfig,
  username: Schema.optionalKey(Schema.String),
  source: Schema.String,
})

type DiscoveredServers = Schema.Schema.Type<typeof DiscoveredServers>

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
  socket: Schema.String,
  config: ConfigState,
  database: Schema.Union([
    Schema.TaggedStruct("ok", {}),
    Schema.TaggedStruct("error", { message: Schema.String }),
  ]).pipe(Schema.toTaggedUnion("_tag")),
})

type ServerStatus = Schema.Schema.Type<typeof ServerStatus>

export { AccountSave, ConfigState, DiscoveredServers, DiscoveryResult, NewAccount, ServerStatus }
