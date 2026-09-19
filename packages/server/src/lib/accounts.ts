import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId } from "@vingroto/core/ids"
import type { AccountSave, NewAccount } from "@vingroto/core/protocol/accounts"

import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"

import type { AccountNotFound, AccountOrderInvalid } from "@/lib/config/accounts"
import type { ConfigInvalid, ConfigUnreadable } from "@/lib/config/load"
import type { ConfigWriteError } from "@/lib/config/save"
import type { CredentialError } from "@/lib/credential/service"

import { makeReorderAccounts, makeSubmitAccount, makeUpdateAccount } from "@/lib/config/accounts"
import { usernameReference } from "@/lib/credential/refs"
import { Credential } from "@/lib/credential/service"
import { ServerEvents } from "@/lib/events"
import { Scheduler } from "@/lib/scheduler"

type AccountWriteError = ConfigInvalid | ConfigUnreadable | ConfigWriteError | CredentialError

interface AccountsShape {
  readonly create: (input: NewAccount) => Effect.Effect<AccountConfig, AccountWriteError>
  readonly update: (
    id: AccountId,
    input: AccountSave,
  ) => Effect.Effect<AccountConfig, AccountWriteError | AccountNotFound>
  readonly reorder: (
    accountIds: readonly AccountId[],
  ) => Effect.Effect<void, AccountWriteError | AccountOrderInvalid>
  readonly username: (id: AccountId) => Effect.Effect<string | null>
}

class Accounts extends Context.Service<Accounts, AccountsShape>()("vingroto/lib/server/Accounts") {
  static readonly layer = Layer.effect(
    Accounts,
    Effect.gen(function* makeAccounts() {
      const events = yield* ServerEvents
      const scheduler = yield* Scheduler
      const credential = yield* Credential
      const paths = yield* AppPaths
      const fs = yield* FileSystem.FileSystem

      const submit = makeSubmitAccount({ configPath: paths.config, credential, fs })
      const persistUpdate = makeUpdateAccount({ configPath: paths.config, credential, fs })
      const persistOrder = makeReorderAccounts(paths.config, fs)

      const create = Effect.fn("Accounts.create")(function* createAccount(input: NewAccount) {
        const account = yield* submit(input)
        yield* events.publish({ _tag: "config-changed" })
        yield* scheduler.request({}).pipe(
          Effect.catch((error) =>
            Effect.logWarning("background sync after account creation failed").pipe(
              Effect.annotateLogs({ reason: describeError(error) }),
            ),
          ),
          Effect.forkDetach,
        )
        return account
      })

      const update = Effect.fn("Accounts.update")(function* updateConfiguredAccount(
        id: AccountId,
        input: AccountSave,
      ) {
        const account = yield* persistUpdate(id, input)
        yield* events.publish({ _tag: "config-changed" })
        return account
      })

      const reorder = Effect.fn("Accounts.reorder")(function* reorderConfiguredAccounts(
        accountIds: readonly AccountId[],
      ) {
        yield* persistOrder(accountIds)
        yield* events.publish({ _tag: "config-changed" })
      })

      const username = Effect.fn("Accounts.username")(function* accountUsername(id: AccountId) {
        return yield* credential
          .get(usernameReference(id))
          .pipe(Effect.orElseSucceed((): string | null => null))
      })

      return Accounts.of({ create, reorder, update, username })
    }),
  )
}

export { Accounts, type AccountsShape }
