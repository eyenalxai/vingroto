import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

import { NotificationsConfig, SendConfig, SyncConfig } from "../../config/schema"
import { InternalError, InvalidRequestError } from "./errors"

const saveSyncSettings = HttpApiEndpoint.put("settings.saveSyncSettings", "/api/settings/sync", {
  payload: SyncConfig,
  success: Schema.Void,
  error: [InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "settings.saveSyncSettings",
    summary: "Save sync settings",
    description: "Replace the persisted sync settings.",
  }),
)

const saveNotifications = HttpApiEndpoint.put(
  "settings.saveNotifications",
  "/api/settings/notifications",
  {
    payload: NotificationsConfig,
    success: Schema.Void,
    error: [InvalidRequestError, InternalError],
  },
).annotateMerge(
  OpenApi.annotations({
    identifier: "settings.saveNotifications",
    summary: "Save notification settings",
    description: "Replace the persisted new-mail notification settings.",
  }),
)

const saveSend = HttpApiEndpoint.put("settings.saveSend", "/api/settings/send", {
  payload: SendConfig,
  success: Schema.Void,
  error: [InvalidRequestError, InternalError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "settings.saveSend",
    summary: "Save send settings",
    description: "Replace the persisted sending settings.",
  }),
)

const SettingsGroup = HttpApiGroup.make("settings").add(
  saveSyncSettings,
  saveNotifications,
  saveSend,
)

export { SettingsGroup }
