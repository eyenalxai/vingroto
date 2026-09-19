import { describeError } from "@vingroto/core/errors"
import { InternalError, InvalidRequestError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { Settings } from "@/lib/settings"

const toInternal = (error: unknown) => new InternalError({ message: describeError(error) })

const SettingsHandlers = HttpApiBuilder.group(ServerApi, "settings", (handlers) =>
  handlers
    .handle("settings.saveSyncSettings", ({ payload }) =>
      Effect.gen(function* saveSyncSettings() {
        if (payload.initialDays < 1) {
          return yield* new InvalidRequestError({
            field: "initialDays",
            message: "initialDays must be at least 1",
          })
        }
        if (payload.intervalMinutes < 1) {
          return yield* new InvalidRequestError({
            field: "intervalMinutes",
            message: "intervalMinutes must be at least 1",
          })
        }
        return yield* Settings.pipe(
          Effect.flatMap((settings) => settings.saveSyncSettings(payload)),
          Effect.mapError((error): InvalidRequestError | InternalError => {
            if (error._tag === "ConfigInvalid") {
              return new InvalidRequestError({
                message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
              })
            }
            if (error._tag === "SyncSettingsInvalid") {
              return new InvalidRequestError({ message: error.message })
            }
            return toInternal(error)
          }),
        )
      }),
    )
    .handle("settings.saveSend", ({ payload }) => {
      if (payload.delaySeconds < 0) {
        return Effect.fail(
          new InvalidRequestError({
            field: "delaySeconds",
            message: "delaySeconds must be at least 0",
          }),
        )
      }
      return Settings.pipe(
        Effect.flatMap((settings) => settings.saveSendSettings(payload)),
        Effect.mapError((error): InvalidRequestError | InternalError => {
          if (error._tag === "ConfigInvalid") {
            return new InvalidRequestError({
              message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
            })
          }
          return toInternal(error)
        }),
      )
    })
    .handle("settings.saveNotifications", ({ payload }) =>
      Settings.pipe(
        Effect.flatMap((settings) => settings.saveNotifications(payload)),
        Effect.mapError((error): InvalidRequestError | InternalError => {
          if (error._tag === "ConfigInvalid") {
            return new InvalidRequestError({
              message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
            })
          }
          return toInternal(error)
        }),
      ),
    )
    .handle("settings.saveEditor", ({ payload }) =>
      Settings.pipe(
        Effect.flatMap((settings) => settings.saveEditor(payload.editor)),
        Effect.mapError((error): InvalidRequestError | InternalError => {
          if (error._tag === "ConfigInvalid") {
            return new InvalidRequestError({
              message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
            })
          }
          return toInternal(error)
        }),
      ),
    ),
)

export { SettingsHandlers }
