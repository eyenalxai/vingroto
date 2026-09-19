import { describeError } from "@vingroto/core/errors"
import {
  AccountNotFoundError,
  CredentialsError,
  InvalidRequestError,
} from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { Accounts } from "@/lib/accounts"
import { ServerApi } from "@/lib/api/api"
import { internalFailure } from "@/lib/api/internal-error"
import { Discovery } from "@/lib/mail/autoconfig"

const credentialStoreMessage = "the credential store could not be used"

const credentialStoreFailure = (error: {
  readonly operation: "lookup" | "store"
  readonly message: string
}) =>
  Effect.logError("credential store failed").pipe(
    Effect.annotateLogs({ operation: error.operation, reason: describeError(error) }),
    Effect.flatMap(() => Effect.fail(new CredentialsError({ message: credentialStoreMessage }))),
  )

const AccountHandlers = HttpApiBuilder.group(ServerApi, "accounts", (handlers) =>
  handlers
    .handle("account.discover", ({ payload }) =>
      Discovery.pipe(Effect.flatMap((discovery) => discovery.discover(payload.email))),
    )
    .handle("account.create", ({ payload }) =>
      Effect.catchTags(
        Accounts.pipe(Effect.flatMap((accounts) => accounts.create(payload))),
        {
          CredentialNotFound: (error) =>
            Effect.fail(new CredentialsError({ message: error.message })),
          KeyringError: credentialStoreFailure,
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
    .handle("account.update", ({ params, payload }) =>
      Effect.catchTags(
        Accounts.pipe(Effect.flatMap((accounts) => accounts.update(params.accountId, payload))),
        {
          AccountNotFound: (error) =>
            Effect.fail(new AccountNotFoundError({ accountId: error.id, message: error.message })),
          CredentialNotFound: (error) =>
            Effect.fail(new CredentialsError({ message: error.message })),
          KeyringError: credentialStoreFailure,
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
    .handle("account.reorder", ({ payload }) =>
      Effect.catchTags(
        Accounts.pipe(Effect.flatMap((accounts) => accounts.reorder(payload.accountIds))),
        {
          AccountOrderInvalid: (error) =>
            Effect.fail(
              new InvalidRequestError({ field: "body.accountIds", message: error.message }),
            ),
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
    .handle("account.username", ({ params }) =>
      Accounts.pipe(
        Effect.flatMap((accounts) => accounts.username(params.accountId)),
        Effect.catchTags({ KeyringError: internalFailure }, internalFailure),
      ),
    ),
)

export { AccountHandlers }
