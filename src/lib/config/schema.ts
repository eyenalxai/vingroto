import * as Schema from "effect/Schema"

class ServerConfig extends Schema.Class<ServerConfig>("ServerConfig")({
  host: Schema.String,
  port: Schema.Int,
  security: Schema.Literals(["tls", "starttls", "none"]),
}) {}

class AccountConfig extends Schema.Class<AccountConfig>("AccountConfig")({
  id: Schema.String,
  label: Schema.String,
  name: Schema.String,
  email: Schema.String,
  username: Schema.String,
  password: Schema.String,
  imap: ServerConfig,
  smtp: ServerConfig,
}) {}

class SyncConfig extends Schema.Class<SyncConfig>("SyncConfig")({
  initialDays: Schema.Int,
  intervalMinutes: Schema.Int,
}) {}

class AppConfigFile extends Schema.Class<AppConfigFile>("AppConfigFile")({
  accounts: Schema.Array(AccountConfig),
  sync: Schema.optional(SyncConfig),
}) {}

interface AppConfig {
  readonly accounts: readonly AccountConfig[]
  readonly sync: SyncConfig
}

export { AccountConfig, AppConfigFile, ServerConfig, SyncConfig, type AppConfig }
