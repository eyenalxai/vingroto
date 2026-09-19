import * as Schema from "effect/Schema"

import { AccountId } from "../ids"

const SyncEvent = Schema.Union([
  Schema.TaggedStruct("mailbox-start", {
    accountId: AccountId,
    path: Schema.String,
  }),
  Schema.TaggedStruct("mailbox-done", {
    accountId: AccountId,
    path: Schema.String,
    fetched: Schema.Int,
    stored: Schema.Int,
    reset: Schema.Boolean,
  }),
  Schema.TaggedStruct("mailbox-error", {
    accountId: AccountId,
    path: Schema.String,
    message: Schema.String,
  }),
  Schema.TaggedStruct("sync-error", {
    accountId: AccountId,
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
