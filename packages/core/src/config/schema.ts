import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { AccountId } from "../ids"

const ServerConfig = Schema.Struct({
  host: Schema.String,
  port: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_535 })),
  security: Schema.Literals(["tls", "starttls", "none"]),
})

type ServerConfig = typeof ServerConfig.Type

const AccountConfig = Schema.Struct({
  id: AccountId,
  label: Schema.String,
  name: Schema.optionalKey(Schema.String),
  email: Schema.String,
  saveSent: Schema.Boolean.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true))),
  imap: ServerConfig,
  smtp: ServerConfig,
})

type AccountConfig = typeof AccountConfig.Type

const SyncConfig = Schema.Struct({
  initialDays: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3650 })),
  intervalMinutes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1440 })),
})

type SyncConfig = typeof SyncConfig.Type

const syncDefaults = (): SyncConfig => ({ initialDays: 30, intervalMinutes: 5 })

const NotificationsConfig = Schema.Struct({
  enabled: Schema.Boolean,
})

type NotificationsConfig = typeof NotificationsConfig.Type

const defaultNotifications = (): NotificationsConfig => ({ enabled: true })

const SendConfig = Schema.Struct({
  delaySeconds: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})

type SendConfig = typeof SendConfig.Type

const defaultSend = (): SendConfig => ({ delaySeconds: 60 })

const EditorConfig = Schema.Literals(["builtin", "system"])

type EditorConfig = typeof EditorConfig.Type

const defaultEditor = (): EditorConfig => "builtin"

const AppConfig = Schema.Struct({
  accounts: Schema.Array(AccountConfig),
  sync: SyncConfig.pipe(Schema.withDecodingDefaultTypeKey(Effect.sync(syncDefaults))),
  notifications: NotificationsConfig.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.sync(defaultNotifications)),
  ),
  send: SendConfig.pipe(Schema.withDecodingDefaultTypeKey(Effect.sync(defaultSend))),
  editor: EditorConfig.pipe(Schema.withDecodingDefaultTypeKey(Effect.sync(defaultEditor))),
})

type AppConfig = typeof AppConfig.Type

// Why: every default is decoded into AppConfig, so the on-disk file contract is the app config contract.
const AppConfigFile = AppConfig

type AppConfigFile = typeof AppConfigFile.Type

export {
  AccountConfig,
  AppConfig,
  AppConfigFile,
  defaultEditor,
  defaultNotifications,
  defaultSend,
  EditorConfig,
  NotificationsConfig,
  SendConfig,
  ServerConfig,
  SyncConfig,
  syncDefaults,
}
