import * as Schema from "effect/Schema"

import { AccountConfig, ServerConfig, SyncConfig } from "../config/schema"

const accountSaveFields = {
  label: Schema.String,
  name: Schema.optional(Schema.String),
  imap: ServerConfig,
  smtp: ServerConfig,
  username: Schema.String,
  password: Schema.optional(Schema.String),
} as const

const AccountSaveSchema = Schema.Struct(accountSaveFields)

type AccountSave = typeof AccountSaveSchema.Type

const NewAccountSchema = Schema.Struct({
  ...accountSaveFields,
  email: Schema.String,
  password: Schema.String,
})

type NewAccount = typeof NewAccountSchema.Type

const SyncSettingsSchema = Schema.Struct({
  initialDays: Schema.Int,
  intervalMinutes: Schema.Int,
})

type SyncSettings = typeof SyncSettingsSchema.Type

const DiscoveredServersSchema = Schema.Struct({
  imap: ServerConfig,
  smtp: ServerConfig,
  username: Schema.optional(Schema.String),
  source: Schema.String,
})

type DiscoveredServers = typeof DiscoveredServersSchema.Type

const DiscoveryResultSchema = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("found"), servers: DiscoveredServersSchema }),
  Schema.Struct({ _tag: Schema.Literal("not-found"), attempts: Schema.Array(Schema.String) }),
])

type DiscoveryResult = typeof DiscoveryResultSchema.Type

const ConfigStateSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("ok"),
    config: Schema.Struct({ accounts: Schema.Array(AccountConfig), sync: SyncConfig }),
  }),
  Schema.Struct({ _tag: Schema.Literal("empty") }),
  Schema.Struct({ _tag: Schema.Literal("error"), message: Schema.String }),
])

type ConfigState = typeof ConfigStateSchema.Type

const ServerStatusSchema = Schema.Struct({
  version: Schema.String,
  pid: Schema.Int,
  startedAt: Schema.Int,
  socket: Schema.String,
  config: ConfigStateSchema,
  database: Schema.Union([
    Schema.Struct({ _tag: Schema.Literal("ok") }),
    Schema.Struct({ _tag: Schema.Literal("error"), message: Schema.String }),
  ]),
})

type ServerStatus = typeof ServerStatusSchema.Type

export {
  AccountSaveSchema,
  ConfigStateSchema,
  DiscoveredServersSchema,
  DiscoveryResultSchema,
  NewAccountSchema,
  ServerStatusSchema,
  SyncSettingsSchema,
  type AccountSave,
  type ConfigState,
  type DiscoveredServers,
  type DiscoveryResult,
  type NewAccount,
  type ServerStatus,
  type SyncSettings,
}
