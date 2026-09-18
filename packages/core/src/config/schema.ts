import * as Schema from "effect/Schema"

import { AccountId } from "../ids"

const ServerConfig = Schema.Struct({
  host: Schema.String,
  port: Schema.Int,
  security: Schema.Literals(["tls", "starttls", "none"]),
})

type ServerConfig = Schema.Schema.Type<typeof ServerConfig>

const AccountConfig = Schema.Struct({
  id: AccountId,
  label: Schema.String,
  name: Schema.optionalKey(Schema.String),
  email: Schema.String,
  imap: ServerConfig,
  smtp: ServerConfig,
})

type AccountConfig = Schema.Schema.Type<typeof AccountConfig>

const SyncConfig = Schema.Struct({
  initialDays: Schema.Int,
  intervalMinutes: Schema.Int,
})

type SyncConfig = Schema.Schema.Type<typeof SyncConfig>

const AppConfig = Schema.Struct({
  accounts: Schema.Array(AccountConfig),
  sync: SyncConfig,
})

type AppConfig = Schema.Schema.Type<typeof AppConfig>

const AppConfigFile = Schema.Struct({
  ...AppConfig.fields,
  sync: Schema.optionalKey(SyncConfig),
})

type AppConfigFile = Schema.Schema.Type<typeof AppConfigFile>

export { AccountConfig, AppConfig, AppConfigFile, ServerConfig, SyncConfig }
