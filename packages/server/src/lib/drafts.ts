import type { Draft, DraftSave } from "@vingroto/core/protocol/outgoing"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { AppPaths } from "@vingroto/core/app-paths"
import { DraftId } from "@vingroto/core/ids"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type { ConfigInvalid, ConfigUnreadable } from "@/lib/config/load"

import { loadConfigFile } from "@/lib/config/load"
import { Database } from "@/lib/db/database"
import { ServerEvents } from "@/lib/events"
import { AccountNotConfigured } from "@/lib/outbox"
import { deleteDraft, listDrafts, saveDraft } from "@/lib/store/drafts"

class DraftNotFound extends Schema.TaggedError<DraftNotFound>()("DraftNotFound", {
  draftId: DraftId,
  message: Schema.String,
}) {}

interface DraftsShape {
  readonly save: (
    input: DraftSave,
  ) => Effect.Effect<
    Draft,
    AccountNotConfigured | ConfigInvalid | ConfigUnreadable | EffectDrizzleQueryError
  >
  readonly list: Effect.Effect<readonly Draft[], EffectDrizzleQueryError>
  readonly delete: (
    draftId: DraftId,
  ) => Effect.Effect<void, DraftNotFound | EffectDrizzleQueryError>
}

class Drafts extends Context.Service<Drafts, DraftsShape>()("@vingroto/server/lib/drafts") {
  static readonly layer = Layer.effect(
    Drafts,
    Effect.gen(function* makeDrafts() {
      const database = yield* Database
      const events = yield* ServerEvents
      const paths = yield* AppPaths
      const fs = yield* FileSystem.FileSystem
      const readConfig = loadConfigFile(paths.config, fs)

      const save = Effect.fn("Drafts.save")(
        function* saveStoredDraft(input: DraftSave) {
          const config = yield* readConfig
          const account = config.accounts.find((candidate) => candidate.id === input.accountId)
          if (account === undefined) {
            return yield* new AccountNotConfigured({
              accountId: input.accountId,
              message: `account ${input.accountId} is not configured`,
            })
          }
          const draft = yield* saveDraft(input)
          yield* events.publish({ _tag: "data-changed" })
          return draft
        },
        Effect.provideService(Database, database),
      )

      const list = listDrafts().pipe(
        Effect.provideService(Database, database),
        Effect.withSpan("Drafts.list"),
      )

      const remove = Effect.fn("Drafts.delete")(
        function* deleteStoredDraft(draftId: DraftId) {
          const removed = yield* deleteDraft(draftId)
          if (!removed) {
            return yield* new DraftNotFound({
              draftId,
              message: `draft ${draftId} was not found`,
            })
          }
          return yield* events.publish({ _tag: "data-changed" })
        },
        Effect.provideService(Database, database),
      )

      return Drafts.of({ delete: remove, list, save })
    }),
  )
}

export { DraftNotFound, Drafts, type DraftsShape }
