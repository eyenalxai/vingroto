import { describeError } from "@vingroto/core/errors"
import { InvalidRequestError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { internalFailure } from "@/lib/api/internal-error"
import { Settings } from "@/lib/settings"

const SettingsHandlers = HttpApiBuilder.group(ServerApi, "settings", (handlers) =>
  handlers
    .handle("settings.saveSyncSettings", ({ payload }) =>
      Effect.catchTags(
        Settings.pipe(Effect.flatMap((settings) => settings.saveSyncSettings(payload))),
        {
          ConfigInvalid: (error) =>
            Effect.fail(
              new InvalidRequestError({
                message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
              }),
            ),
          SyncSettingsInvalid: (error) =>
            Effect.fail(new InvalidRequestError({ message: error.message })),
        },
        internalFailure,
      ),
    )
    .handle("settings.saveSend", ({ payload }) =>
      Effect.catchTags(
        Settings.pipe(Effect.flatMap((settings) => settings.saveSendSettings(payload))),
        {
          ConfigInvalid: (error) =>
            Effect.fail(
              new InvalidRequestError({
                message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
              }),
            ),
        },
        internalFailure,
      ),
    )
    .handle("settings.saveNotifications", ({ payload }) =>
      Effect.catchTags(
        Settings.pipe(Effect.flatMap((settings) => settings.saveNotifications(payload))),
        {
          ConfigInvalid: (error) =>
            Effect.fail(
              new InvalidRequestError({
                message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
              }),
            ),
        },
        internalFailure,
      ),
    )
    .handle("settings.saveEditor", ({ payload }) =>
      Effect.catchTags(
        Settings.pipe(Effect.flatMap((settings) => settings.saveEditor(payload.editor))),
        {
          ConfigInvalid: (error) =>
            Effect.fail(
              new InvalidRequestError({
                message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
              }),
            ),
        },
        internalFailure,
      ),
    ),
)

export { SettingsHandlers }
