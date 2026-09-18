import * as Schema from "effect/Schema"

const SyncEvent = Schema.Union([
  Schema.TaggedStruct("mailbox-start", {
    accountId: Schema.String,
    path: Schema.String,
  }),
  Schema.TaggedStruct("mailbox-done", {
    accountId: Schema.String,
    path: Schema.String,
    fetched: Schema.Int,
    stored: Schema.Int,
  }),
  Schema.TaggedStruct("mailbox-error", {
    accountId: Schema.String,
    path: Schema.String,
    message: Schema.String,
  }),
  Schema.TaggedStruct("sync-error", {
    accountId: Schema.String,
    message: Schema.String,
  }),
]).pipe(Schema.toTaggedUnion("_tag"))

type SyncEvent = typeof SyncEvent.Type

const ServerEvent = Schema.Union([
  SyncEvent,
  Schema.TaggedStruct("data-changed", {}),
  Schema.TaggedStruct("config-changed", {}),
]).pipe(Schema.toTaggedUnion("_tag"))

type ServerEvent = typeof ServerEvent.Type

const describeSyncEvent = (event: SyncEvent): string =>
  SyncEvent.match(event, {
    "mailbox-start": ({ path }) => `syncing ${path}`,
    "mailbox-done": ({ path, stored }) =>
      stored === 0 ? `${path} · up to date` : `${path} · ${stored} new`,
    "mailbox-error": ({ path, message }) => `${path} · ${message}`,
    "sync-error": ({ message }) => `sync failed · ${message}`,
  })

export { ServerEvent, SyncEvent, describeSyncEvent }
