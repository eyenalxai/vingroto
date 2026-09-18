import { describeError } from "@vingroto/core/errors"
import {
  AccountNotFoundError,
  CredentialsError,
  InternalError,
  InvalidRequestError,
} from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { Accounts } from "@/lib/accounts"
import { ServerApi } from "@/lib/api/api"
import { Discovery } from "@/lib/mail/autoconfig"

const toInternal = (error: unknown) => new InternalError({ message: describeError(error) })

const AccountHandlers = HttpApiBuilder.group(ServerApi, "accounts", (handlers) =>
  handlers
    .handle("account.discover", ({ payload }) =>
      Discovery.pipe(
        Effect.flatMap((discovery) => discovery.discover(payload.email)),
        Effect.mapError(toInternal),
      ),
    )
    .handle("account.create", ({ payload }) =>
      Accounts.pipe(
        Effect.flatMap((accounts) => accounts.create(payload)),
        Effect.mapError((error): CredentialsError | InvalidRequestError | InternalError => {
          if (error._tag === "CredentialNotFound" || error._tag === "KeyringError") {
            return new CredentialsError({ message: describeError(error) })
          }
          if (error._tag === "ConfigInvalid") {
            return new InvalidRequestError({
              message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
            })
          }
          return toInternal(error)
        }),
      ),
    )
    .handle("account.update", ({ params, payload }) =>
      Accounts.pipe(
        Effect.flatMap((accounts) => accounts.update(params.accountId, payload)),
        Effect.mapError(
          (
            error,
          ): AccountNotFoundError | CredentialsError | InvalidRequestError | InternalError => {
            if (error._tag === "AccountNotFound") {
              return new AccountNotFoundError({ accountId: error.id, message: error.message })
            }
            if (error._tag === "CredentialNotFound" || error._tag === "KeyringError") {
              return new CredentialsError({ message: describeError(error) })
            }
            if (error._tag === "ConfigInvalid") {
              return new InvalidRequestError({
                message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
              })
            }
            return toInternal(error)
          },
        ),
      ),
    )
    .handle("account.username", ({ params }) =>
      Accounts.pipe(
        Effect.flatMap((accounts) => accounts.username(params.accountId)),
        Effect.mapError(toInternal),
      ),
    )
    .handle("account.saveSyncSettings", ({ payload }) =>
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
        return yield* Accounts.pipe(
          Effect.flatMap((accounts) => accounts.saveSyncSettings(payload)),
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
    ),
)

export { AccountHandlers }
