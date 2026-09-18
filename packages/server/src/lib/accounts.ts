import type { AccountConfig, SyncConfig } from "@vingroto/core/config/schema"
import type { AccountSave, NewAccount } from "@vingroto/core/protocol/accounts"

import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"

import type { AccountNotFound } from "@/lib/config/accounts"
import type { ConfigInvalid, ConfigUnreadable } from "@/lib/config/load"
import type { ConfigWriteError } from "@/lib/config/save"
import type { SyncSettingsInvalid } from "@/lib/config/sync"
import type { CredentialError } from "@/lib/credential/service"

import { submitAccount, updateAccount } from "@/lib/config/accounts"
import { updateSyncSettings } from "@/lib/config/sync"
import { usernameReference } from "@/lib/credential/refs"
import { Credential } from "@/lib/credential/service"
import { ServerEvents } from "@/lib/events"
import { Scheduler } from "@/lib/scheduler"

type AccountWriteError = ConfigInvalid | ConfigUnreadable | ConfigWriteError | CredentialError

interface AccountsShape {
  readonly create: (input: NewAccount) => Effect.Effect<AccountConfig, AccountWriteError>
  readonly update: (
    id: string,
    input: AccountSave,
  ) => Effect.Effect<AccountConfig, AccountWriteError | AccountNotFound>
  readonly saveSyncSettings: (
    settings: SyncConfig,
  ) => Effect.Effect<
    void,
    ConfigInvalid | ConfigUnreadable | ConfigWriteError | SyncSettingsInvalid
  >
  readonly username: (id: string) => Effect.Effect<string | null>
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

      const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(
          Effect.provideService(AppPaths, paths),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Credential, credential),
        )

      const create = Effect.fn("Accounts.create")(function* createAccount(input: NewAccount) {
        const account = yield* provide(submitAccount(input))
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
        id: string,
        input: AccountSave,
      ) {
        const account = yield* provide(updateAccount(id, input))
        yield* events.publish({ _tag: "config-changed" })
        return account
      })

      const saveSyncSettings = Effect.fn("Accounts.saveSyncSettings")(function* persistSyncSettings(
        settings: SyncConfig,
      ) {
        yield* provide(updateSyncSettings(settings))
        yield* events.publish({ _tag: "config-changed" })
      })

      const username = Effect.fn("Accounts.username")(function* accountUsername(id: string) {
        return yield* credential
          .get(usernameReference(id))
          .pipe(Effect.orElseSucceed((): string | null => null))
      })

      return Accounts.of({ create, update, saveSyncSettings, username })
    }),
  )
}

export { Accounts, type AccountsShape }
