import type { OAuthAuthorize } from "@vingroto/core/protocol/accounts"

import { describeError } from "@vingroto/core/errors"
import {
  AccountNotFoundError,
  CredentialsError,
  InvalidRequestError,
} from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import type { OAuthShape } from "@/lib/oauth"

import { Accounts } from "@/lib/accounts"
import { ServerApi } from "@/lib/api/api"
import { internalFailure } from "@/lib/api/internal-error"
import { invalidField } from "@/lib/api/invalid-request"
import { Discovery } from "@/lib/mail/autoconfig"
import { OAuth } from "@/lib/oauth"

const credentialStoreMessage = "the credential store could not be used"

const credentialStoreFailure = (error: {
  readonly operation: "lookup" | "store"
  readonly message: string
}) =>
  Effect.logError("credential store failed").pipe(
    Effect.annotateLogs({ operation: error.operation, reason: describeError(error) }),
    Effect.flatMap(() => Effect.fail(new CredentialsError({ message: credentialStoreMessage }))),
  )

const authorizeOAuthAccount = Effect.fn("AccountHandlers.authorizeOAuthAccount")(
  function* authorizeOAuthAccount(oauth: OAuthShape, payload: OAuthAuthorize) {
    const email = payload.email.trim()
    if (email.length === 0) {
      return yield* invalidField("Body", "email", "an email address is required")
    }
    const clientId = payload.clientId.trim()
    if (clientId.length === 0) {
      return yield* invalidField("Body", "clientId", "a client id is required")
    }
    return yield* Effect.catchTags(
      oauth.authorize({
        clientId,
        email,
        ...(payload.clientSecret === undefined ? {} : { clientSecret: payload.clientSecret }),
      }),
      {
        OAuthAuthorizationFailed: (error) =>
          Effect.fail(new CredentialsError({ message: error.message })),
        OAuthReauthorizationRequired: (error) =>
          Effect.fail(new CredentialsError({ message: error.message })),
      },
      internalFailure,
    )
  },
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
          AccountAuthInvalid: (error) =>
            Effect.fail(invalidField("Body", error.field, error.message)),
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
    .handle("account.oauth.authorize", ({ payload }) =>
      Effect.flatMap(OAuth, (oauth) => authorizeOAuthAccount(oauth, payload)),
    )
    .handle("account.update", ({ params, payload }) =>
      Effect.catchTags(
        Accounts.pipe(Effect.flatMap((accounts) => accounts.update(params.accountId, payload))),
        {
          AccountNotFound: (error) =>
            Effect.fail(new AccountNotFoundError({ accountId: error.id, message: error.message })),
          AccountAuthInvalid: (error) =>
            Effect.fail(invalidField("Body", error.field, error.message)),
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
            Effect.fail(invalidField("Body", "accountIds", error.message)),
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

export { AccountHandlers, authorizeOAuthAccount }
