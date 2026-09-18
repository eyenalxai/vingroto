import * as Schema from "effect/Schema"

const SyncEventSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("mailbox-start"),
    accountId: Schema.String,
    path: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("mailbox-done"),
    accountId: Schema.String,
    path: Schema.String,
    fetched: Schema.Int,
    stored: Schema.Int,
  }),
  Schema.Struct({
    _tag: Schema.Literal("mailbox-error"),
    accountId: Schema.String,
    path: Schema.String,
    message: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("sync-error"),
    accountId: Schema.String,
    message: Schema.String,
  }),
])

type SyncEvent = typeof SyncEventSchema.Type

const ServerEventSchema = Schema.Union([
  SyncEventSchema,
  Schema.Struct({ _tag: Schema.Literal("data-changed") }),
  Schema.Struct({ _tag: Schema.Literal("config-changed") }),
])

type ServerEvent = typeof ServerEventSchema.Type

const describeSyncEvent = (event: SyncEvent): string => {
  if (event._tag === "mailbox-start") {
    return `syncing ${event.path}`
  }
  if (event._tag === "mailbox-done") {
    return event.stored === 0 ? `${event.path} · up to date` : `${event.path} · ${event.stored} new`
  }
  if (event._tag === "mailbox-error") {
    return `${event.path} · ${event.message}`
  }
  return `sync failed · ${event.message}`
}

export { ServerEventSchema, SyncEventSchema, describeSyncEvent, type ServerEvent, type SyncEvent }
