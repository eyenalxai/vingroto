import * as Schema from "effect/Schema"

const ServerConfig = Schema.Struct({
  host: Schema.String,
  port: Schema.Int,
  security: Schema.Literals(["tls", "starttls", "none"]),
})

interface ServerConfig extends Schema.Schema.Type<typeof ServerConfig> {}

const AccountConfig = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  name: Schema.optionalKey(Schema.String),
  email: Schema.String,
  imap: ServerConfig,
  smtp: ServerConfig,
})

interface AccountConfig extends Schema.Schema.Type<typeof AccountConfig> {}

const SyncConfig = Schema.Struct({
  initialDays: Schema.Int,
  intervalMinutes: Schema.Int,
})

interface SyncConfig extends Schema.Schema.Type<typeof SyncConfig> {}

const AppConfigFile = Schema.Struct({
  accounts: Schema.Array(AccountConfig),
  sync: Schema.optionalKey(SyncConfig),
})

interface AppConfigFile extends Schema.Schema.Type<typeof AppConfigFile> {}

interface AppConfig {
  readonly accounts: readonly AccountConfig[]
  readonly sync: SyncConfig
}

export { AccountConfig, AppConfigFile, ServerConfig, SyncConfig, type AppConfig }
