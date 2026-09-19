import * as Effect from "effect/Effect"
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
  saveSent: Schema.Boolean.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true))),
  imap: ServerConfig,
  smtp: ServerConfig,
})

type AccountConfig = Schema.Schema.Type<typeof AccountConfig>

const SyncConfig = Schema.Struct({
  initialDays: Schema.Int,
  intervalMinutes: Schema.Int,
})

type SyncConfig = Schema.Schema.Type<typeof SyncConfig>

const NotificationsConfig = Schema.Struct({
  enabled: Schema.Boolean,
})

type NotificationsConfig = Schema.Schema.Type<typeof NotificationsConfig>

const SendConfig = Schema.Struct({
  delaySeconds: Schema.Int,
})

type SendConfig = Schema.Schema.Type<typeof SendConfig>

const defaultSend = (): SendConfig => {
  return { delaySeconds: 60 }
}

const EditorConfig = Schema.Literals(["builtin", "system"])

type EditorConfig = Schema.Schema.Type<typeof EditorConfig>

const defaultEditor = (): EditorConfig => "builtin"

const AppConfig = Schema.Struct({
  accounts: Schema.Array(AccountConfig),
  sync: SyncConfig,
  notifications: NotificationsConfig,
  send: SendConfig.pipe(Schema.withDecodingDefaultTypeKey(Effect.sync(defaultSend))),
  editor: EditorConfig.pipe(Schema.withDecodingDefaultTypeKey(Effect.sync(defaultEditor))),
})

type AppConfig = Schema.Schema.Type<typeof AppConfig>

const AppConfigFile = Schema.Struct({
  ...AppConfig.fields,
  sync: Schema.optionalKey(SyncConfig),
  notifications: Schema.optionalKey(NotificationsConfig),
})

type AppConfigFile = Schema.Schema.Type<typeof AppConfigFile>

export {
  AccountConfig,
  AppConfig,
  AppConfigFile,
  EditorConfig,
  NotificationsConfig,
  SendConfig,
  ServerConfig,
  SyncConfig,
}
