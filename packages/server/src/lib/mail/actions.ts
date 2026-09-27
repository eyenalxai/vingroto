import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId, MailboxId, MessageId } from "@vingroto/core/ids"
import type { ActionFailure, MoveOutcome, SeenOutcome } from "@vingroto/core/protocol/mail"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type { ConfigInvalid, ConfigUnreadable } from "@/lib/config/load"
import type { KeyringError } from "@/lib/credential/keyring"
import type { CredentialNotFound } from "@/lib/credential/service"
import type { ImapError } from "@/lib/mail/imap-types"
import type { MessageActionTarget } from "@/lib/store/message-action-targets"

import { loadConfig } from "@/lib/config/load"
import { Database } from "@/lib/db/database"
import { ServerEvents } from "@/lib/events"
import { Imap } from "@/lib/mail/imap"
import { listMailboxes } from "@/lib/store/mailboxes"
import {
  listEmailActionTargets,
  listMessageActionTargets,
} from "@/lib/store/message-action-targets"
import { deleteMessages, setMessagesSeen } from "@/lib/store/messages"

class MessageActionError extends Schema.TaggedError<MessageActionError>()("MessageActionError", {
  message: Schema.String,
}) {}

interface MailActionsShape {
  readonly setSeenByIds: (
    ids: readonly MessageId[],
    seen: boolean,
  ) => Effect.Effect<SeenOutcome, ConfigInvalid | ConfigUnreadable | EffectDrizzleQueryError>
  readonly moveByIds: (
    ids: readonly MessageId[],
    targetMailboxId: MailboxId,
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
  return [...groups].map(([mailboxPath, entries]) => ({ mailboxPath, requests: entries }))
}

const groupByAccount = (requests: readonly MessageActionTarget[]) => {
  const groups = new Map<AccountId, MessageActionTarget[]>()
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

const imapFailureHandlers = (
  account: AccountConfig,
  mailboxPath: string,
  errors: ActionFailure[],
) => ({
  ImapError: (error: ImapError) =>
    Effect.sync(() => {
      errors.push({
        _tag: "imap",
        accountId: account.id,
        mailboxPath,
        operation: error.operation,
        message: error.message,
      })
    }),
  KeyringError: (error: KeyringError) =>
    Effect.sync(() => {
      errors.push({
        _tag: "keyring",
        accountId: account.id,
        mailboxPath,
        operation: error.operation,
        message: error.message,
      })
    }),
  CredentialNotFound: (error: CredentialNotFound) =>
    Effect.sync(() => {
      errors.push({
        _tag: "credential-missing",
        accountId: account.id,
        mailboxPath,
        reference: error.reference,
        message: error.message,
      })
    }),
})

const cacheFailure = (account: AccountConfig, error: unknown, errors: ActionFailure[]) =>
  Effect.sync(() => {
    errors.push({
      _tag: "cache-write",
      accountId: account.id,
      message: describeError(error),
    })
  })

class MailActions extends Context.Service<MailActions, MailActionsShape>()(
  "@vingroto/server/lib/mail/actions/MailActions",
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
        const updated: MessageId[] = []
        const errors: ActionFailure[] = []
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
                    updated.push(request.messageId)
                  }
                }),
              ),
              Effect.catchTags(imapFailureHandlers(account, group.mailboxPath, errors)),
            )
        }
        yield* setMessagesSeen(updated, seen).pipe(
          Effect.catchTag("EffectDrizzleQueryError", (error) =>
            cacheFailure(account, error, errors),
          ),
        )
        return { errors, updated }
      })

      const move = Effect.fn("MailActions.move")(function* moveToMailbox(
        account: AccountConfig,
        requests: readonly MessageActionTarget[],
        targetPath: string,
      ) {
        const eligible = requests.filter((request) => request.mailboxPath !== targetPath)
        const moved: MessageId[] = []
        const errors: ActionFailure[] = []
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
              Effect.catchTags(imapFailureHandlers(account, group.mailboxPath, errors)),
            )
        }
        yield* deleteMessages(moved).pipe(
          Effect.catchTag("EffectDrizzleQueryError", (error) =>
            cacheFailure(account, error, errors),
          ),
        )
        return { moved: moved.length, skipped: requests.length - eligible.length, errors }
      })

      const setSeenByIds = Effect.fn("MailActions.setSeenByIds")(
        function* applySeenByIds(ids: readonly MessageId[], seen: boolean) {
          const config = yield* loadConfig()
          const targets = yield* listEmailActionTargets(ids)
          const requestedIds = new Set(targets.requested.map((target) => target.messageId))
          const accounts = new Map(config.accounts.map((account) => [account.id, account]))
          let affected = 0
          const errors: ActionFailure[] = []
          for (const [accountId, group] of groupByAccount(targets.copies)) {
            const account = accounts.get(accountId)
            if (account === undefined) {
              errors.push({ _tag: "account-not-configured", accountId })
              continue
            }
            const outcome = yield* setSeen(account, group, seen)
            for (const messageId of outcome.updated) {
              if (requestedIds.has(messageId)) {
                affected += 1
              }
            }
            errors.push(...outcome.errors)
          }
          const missing = new Set(ids).size - targets.requested.length
          if (missing > 0) {
            errors.push({ _tag: "messages-not-found", count: missing })
          }
          yield* events.publish({ _tag: "data-changed" })
          return { affected, errors }
        },
        Effect.provideService(Database, database),
        Effect.provideService(AppPaths, paths),
        Effect.provideService(FileSystem.FileSystem, fs),
      )

      const moveByIds = Effect.fn("MailActions.moveByIds")(
        function* moveByIds(ids: readonly MessageId[], targetMailboxId: MailboxId) {
          const targets = yield* listMessageActionTargets(ids)
          const mailboxes = yield* listMailboxes()
          const target = mailboxes.find((row) => row.id === targetMailboxId)
          if (target === undefined) {
            return yield* new MessageActionError({
              message: `moving messages: mailbox ${targetMailboxId} was not found`,
            })
          }
          const accountIds = new Set(targets.map((entry) => entry.accountId))
          if (accountIds.size > 1) {
            return yield* new MessageActionError({
              message: `moving messages: copies belong to ${accountIds.size} accounts, which cannot be moved in one request`,
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
              message: `moving messages: account ${sourceAccountId} is not configured`,
            })
          }
          const outcome = yield* move(account, targets, target.path)
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
