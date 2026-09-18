import type { AccountConfig } from "@vingroto/core/config/schema"
import type { MoveOutcome, SeenOutcome } from "@vingroto/core/protocol/mail"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type { ConfigInvalid, ConfigUnreadable } from "@/lib/config/load"
import type { MessageActionTarget } from "@/lib/store/messages"

import { loadConfig } from "@/lib/config/load"
import { Database } from "@/lib/db/database"
import { ServerEvents } from "@/lib/events"
import { Imap } from "@/lib/mail/imap"
import { listMailboxes } from "@/lib/store/mailboxes"
import { deleteMessages, listMessageActionTargets, setMessagesSeen } from "@/lib/store/messages"

class MessageActionError extends Schema.TaggedError<MessageActionError>()("MessageActionError", {
  message: Schema.String,
}) {}

interface MailActionsShape {
  readonly setSeenByIds: (
    ids: readonly number[],
    seen: boolean,
  ) => Effect.Effect<SeenOutcome, ConfigInvalid | ConfigUnreadable | EffectDrizzleQueryError>
  readonly moveByIds: (
    ids: readonly number[],
    targetMailboxId: number,
  ) => Effect.Effect<
    MoveOutcome,
    MessageActionError | ConfigInvalid | ConfigUnreadable | EffectDrizzleQueryError
  >
}

interface MailboxGroup {
  readonly mailboxPath: string
  readonly requests: readonly MessageActionTarget[]
}

const seenFlag = String.raw`\Seen`

const groupByMailbox = (requests: readonly MessageActionTarget[]): readonly MailboxGroup[] => {
  const groups = new Map<string, MessageActionTarget[]>()
  for (const request of requests) {
    const bucket = groups.get(request.mailboxPath)
    if (bucket === undefined) {
      groups.set(request.mailboxPath, [request])
      continue
    }
    bucket.push(request)
  }
  return [...groups].map(([mailboxPath, entries]) => {
    return { mailboxPath, requests: entries }
  })
}

const groupByAccount = (requests: readonly MessageActionTarget[]) => {
  const groups = new Map<string, MessageActionTarget[]>()
  for (const request of requests) {
    const bucket = groups.get(request.accountId)
    if (bucket === undefined) {
      groups.set(request.accountId, [request])
      continue
    }
    bucket.push(request)
  }
  return groups
}

class MailActions extends Context.Service<MailActions, MailActionsShape>()(
  "vingroto/lib/mail/MailActions",
) {
  static readonly layer = Layer.effect(
    MailActions,
    Effect.gen(function* makeMailActions() {
      const imap = yield* Imap
      const database = yield* Database
      const events = yield* ServerEvents
      const paths = yield* AppPaths
      const fs = yield* FileSystem.FileSystem

      const setSeen = Effect.fn("MailActions.setSeen")(function* applySeen(
        account: AccountConfig,
        requests: readonly MessageActionTarget[],
        seen: boolean,
      ) {
        const applied: number[] = []
        const errors: string[] = []
        for (const group of groupByMailbox(requests)) {
          yield* imap
            .setFlags(
              account,
              group.mailboxPath,
              group.requests.map((request) => request.uid),
              [seenFlag],
              seen ? "add" : "remove",
            )
            .pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  for (const request of group.requests) {
                    applied.push(request.messageId)
                  }
                }),
              ),
              Effect.catch((error) =>
                Effect.sync(() => {
                  errors.push(`${group.mailboxPath}: ${describeError(error)}`)
                }),
              ),
            )
        }
        yield* setMessagesSeen(applied, seen)
        return { affected: applied.length, errors }
      })

      const move = Effect.fn("MailActions.move")(function* moveToMailbox(
        account: AccountConfig,
        requests: readonly MessageActionTarget[],
        targetPath: string,
      ) {
        const eligible = requests.filter((request) => request.mailboxPath !== targetPath)
        const moved: number[] = []
        const errors: string[] = []
        for (const group of groupByMailbox(eligible)) {
          yield* imap
            .moveMessages(
              account,
              group.mailboxPath,
              group.requests.map((request) => request.uid),
              targetPath,
            )
            .pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  for (const request of group.requests) {
                    moved.push(request.messageId)
                  }
                }),
              ),
              Effect.catch((error) =>
                Effect.sync(() => {
                  errors.push(`${group.mailboxPath}: ${describeError(error)}`)
                }),
              ),
            )
        }
        yield* deleteMessages(moved)
        return { moved: moved.length, skipped: requests.length - eligible.length, errors }
      })

      const setSeenByIds = Effect.fn("MailActions.setSeenByIds")(
        function* applySeenByIds(ids: readonly number[], seen: boolean) {
          const config = yield* loadConfig()
          const targets = yield* listMessageActionTargets(ids)
          const accounts = new Map(config.accounts.map((account) => [account.id, account]))
          let affected = 0
          const errors: string[] = []
          for (const [accountId, group] of groupByAccount(targets)) {
            const account = accounts.get(accountId)
            if (account === undefined) {
              errors.push(`account ${accountId} is not configured`)
              continue
            }
            const outcome = yield* setSeen(account, group, seen).pipe(
              Effect.catch((error) =>
                Effect.succeed({
                  affected: 0,
                  errors: [`could not update the local cache · ${describeError(error)}`],
                }),
              ),
            )
            affected += outcome.affected
            errors.push(...outcome.errors)
          }
          const missing = new Set(ids).size - targets.length
          if (missing > 0) {
            errors.push(`${missing} message(s) were not found locally`)
          }
          yield* events.publish({ _tag: "data-changed" })
          return { affected, errors }
        },
        Effect.provideService(Database, database),
        Effect.provideService(AppPaths, paths),
        Effect.provideService(FileSystem.FileSystem, fs),
      )

      const moveByIds = Effect.fn("MailActions.moveByIds")(
        function* moveByIds(ids: readonly number[], targetMailboxId: number) {
          const targets = yield* listMessageActionTargets(ids)
          const mailboxes = yield* listMailboxes()
          const target = mailboxes.find((row) => row.id === targetMailboxId)
          if (target === undefined) {
            return yield* new MessageActionError({
              message: `mailbox ${targetMailboxId} was not found`,
            })
          }
          const accountIds = new Set(targets.map((entry) => entry.accountId))
          if (accountIds.size > 1) {
            return yield* new MessageActionError({
              message: "messages from several accounts cannot be moved in one request",
            })
          }
          const sourceAccountId = accountIds.values().next().value
          if (sourceAccountId === undefined) {
            return { errors: [], moved: 0, skipped: 0 }
          }
          const config = yield* loadConfig()
          const account = config.accounts.find((entry) => entry.id === sourceAccountId)
          if (account === undefined) {
            return yield* new MessageActionError({
              message: `account ${sourceAccountId} is not configured`,
            })
          }
          const outcome = yield* move(account, targets, target.path).pipe(
            Effect.catch((error) =>
              Effect.succeed({
                moved: 0,
                skipped: 0,
                errors: [`could not update the local cache · ${describeError(error)}`],
              }),
            ),
          )
          yield* events.publish({ _tag: "data-changed" })
          return outcome
        },
        Effect.provideService(Database, database),
        Effect.provideService(AppPaths, paths),
        Effect.provideService(FileSystem.FileSystem, fs),
      )

      return MailActions.of({ moveByIds, setSeenByIds })
    }),
  )
}

export { MailActions, MessageActionError, type MailActionsShape }
