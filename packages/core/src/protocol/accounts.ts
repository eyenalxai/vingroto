import * as Schema from "effect/Schema"

import { AccountConfig, ServerConfig, SyncConfig } from "../config/schema"

const AccountSave = Schema.Struct({
  label: Schema.String,
  name: Schema.optionalKey(Schema.String),
  imap: ServerConfig,
  smtp: ServerConfig,
  username: Schema.String,
  password: Schema.optionalKey(Schema.String),
})

interface AccountSave extends Schema.Schema.Type<typeof AccountSave> {}

const NewAccount = Schema.Struct({
  ...AccountSave.fields,
  email: Schema.String,
  password: Schema.String,
})

interface NewAccount extends Schema.Schema.Type<typeof NewAccount> {}

const SyncSettings = Schema.Struct({
  initialDays: Schema.Int,
  intervalMinutes: Schema.Int,
})

interface SyncSettings extends Schema.Schema.Type<typeof SyncSettings> {}

const DiscoveredServers = Schema.Struct({
  imap: ServerConfig,
  smtp: ServerConfig,
  username: Schema.optionalKey(Schema.String),
  source: Schema.String,
})

interface DiscoveredServers extends Schema.Schema.Type<typeof DiscoveredServers> {}

const DiscoveryResult = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("found"), servers: DiscoveredServers }),
  Schema.Struct({ _tag: Schema.tag("not-found"), attempts: Schema.Array(Schema.String) }),
]).pipe(Schema.toTaggedUnion("_tag"))

type DiscoveryResult = typeof DiscoveryResult.Type

const ConfigState = Schema.Union([
  Schema.Struct({
    _tag: Schema.tag("ok"),
    config: Schema.Struct({ accounts: Schema.Array(AccountConfig), sync: SyncConfig }),
  }),
  Schema.Struct({ _tag: Schema.tag("empty") }),
  Schema.Struct({ _tag: Schema.tag("error"), message: Schema.String }),
]).pipe(Schema.toTaggedUnion("_tag"))

type ConfigState = typeof ConfigState.Type

const ServerStatus = Schema.Struct({
  version: Schema.String,
  pid: Schema.Int,
  startedAt: Schema.Int,
  socket: Schema.String,
  config: ConfigState,
  database: Schema.Union([
    Schema.Struct({ _tag: Schema.tag("ok") }),
    Schema.Struct({ _tag: Schema.tag("error"), message: Schema.String }),
  ]).pipe(Schema.toTaggedUnion("_tag")),
})

interface ServerStatus extends Schema.Schema.Type<typeof ServerStatus> {}

export {
  AccountSave,
  ConfigState,
  DiscoveredServers,
  DiscoveryResult,
  NewAccount,
  ServerStatus,
  SyncSettings,
}
