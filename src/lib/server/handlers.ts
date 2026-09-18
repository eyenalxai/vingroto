import { count } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import path from "node:path"

import type { ConfigState, ServerStatus } from "@/lib/protocol/accounts"
import type { MessageActionTarget } from "@/lib/store/messages"

import { AppPaths } from "@/lib/app-paths"
import { submitAccount, updateAccount } from "@/lib/config/accounts"
import { loadConfig } from "@/lib/config/load"
import { updateSyncSettings } from "@/lib/config/sync"
import { usernameReference } from "@/lib/credential/refs"
import { Credential } from "@/lib/credential/service"
import { Database } from "@/lib/db/database"
import { MailboxTable } from "@/lib/db/schema"
import { describeError } from "@/lib/errors"
import { MailActions } from "@/lib/mail/actions"
import { Discovery } from "@/lib/mail/autoconfig"
import { MessageBodies } from "@/lib/mail/bodies"
import { ServerError, ServerRpcs } from "@/lib/protocol/rpc"
import { ServerEvents } from "@/lib/server/events"
import { ServerLifecycle } from "@/lib/server/lifecycle"
import { Scheduler } from "@/lib/server/scheduler"
import { listMailboxes, setMailboxMuted } from "@/lib/store/mailboxes"
import {
  getMessage,
  listMessageActionTargets,
  listMessages,
  listVirtualMessages,
  messageCounts,
  unreadMessageCount,
} from "@/lib/store/messages"

const toServerError = (error: unknown) => new ServerError({ message: describeError(error) })

const readVersion = Effect.gen(function* readPackageVersion() {
  const fs = yield* FileSystem.FileSystem
  const raw = yield* fs.readFileString(path.join(import.meta.dirname, "../../../package.json"))
  const pkg = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.Struct({ version: Schema.String })),
  )(raw)
  return pkg.version
})

const groupTargetsByAccount = (targets: readonly MessageActionTarget[]) => {
  const groups = new Map<string, MessageActionTarget[]>()
  for (const target of targets) {
    const bucket = groups.get(target.accountId)
    if (bucket === undefined) {
      groups.set(target.accountId, [target])
      continue
    }
    bucket.push(target)
  }
  return groups
}

const Handlers = ServerRpcs.toLayer({
  status: () =>
    Effect.gen(function* serverStatus() {
      const appPaths = yield* AppPaths
      const fs = yield* FileSystem.FileSystem
      const database = yield* Database
      const lifecycle = yield* ServerLifecycle
      const version = yield* readVersion.pipe(Effect.mapError(toServerError))
      const exists = yield* fs.exists(appPaths.config).pipe(Effect.orElseSucceed(() => false))
      let config: ConfigState = { _tag: "empty" }
      if (exists) {
        config = yield* loadConfig().pipe(
          Effect.map((loaded) => {
            return {
              _tag: "ok" as const,
              config: { accounts: [...loaded.accounts], sync: loaded.sync },
            }
          }),
          Effect.catchTags({
            ConfigInvalid: (error) =>
              Effect.succeed({
                _tag: "error" as const,
                message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
              }),
            ConfigUnreadable: (error) =>
              Effect.succeed({ _tag: "error" as const, message: error.message }),
          }),
        )
      }
      const databaseState = yield* Effect.gen(function* probeDatabase() {
        const rows = yield* database.client.select({ value: count() }).from(MailboxTable)
        return rows[0]?.value ?? 0
      }).pipe(
        Effect.map((): ServerStatus["database"] => {
          return { _tag: "ok" }
        }),
        Effect.catch((error) =>
          Effect.succeed({ _tag: "error" as const, message: describeError(error) }),
        ),
      )
      return {
        version,
        pid: process.pid,
        startedAt: lifecycle.startedAt,
        socket: lifecycle.socket,
        config,
        database: databaseState,
      }
    }),
  folderSnapshot: () =>
    Effect.gen(function* folderSnapshot() {
      const mailboxes = yield* listMailboxes()
      const counts = yield* messageCounts()
      const unread = yield* unreadMessageCount()
      return {
        mailboxes,
        counts: Array.from(counts, ([mailboxId, mailboxCounts]) => {
          return { mailboxId, counts: mailboxCounts }
        }),
        unread,
      }
    }).pipe(Effect.mapError(toServerError)),
  listMessages: ({ scope, limit }) => {
    if (scope.kind === "mailbox") {
      return listMessages(scope.mailboxId, limit).pipe(Effect.mapError(toServerError))
    }
    if (scope.kind === "unread") {
      return listVirtualMessages({ accountId: scope.accountId, kind: "unread" }, limit).pipe(
        Effect.mapError(toServerError),
      )
    }
    return listVirtualMessages({ kind: "all" }, limit).pipe(Effect.mapError(toServerError))
  },
  getMessage: ({ id }) =>
    getMessage(id).pipe(
      Effect.map((message) => message ?? null),
      Effect.mapError(toServerError),
    ),
  loadBody: ({ id }) =>
    Effect.gen(function* loadMessageBody() {
      const message = yield* getMessage(id)
      if (message === undefined) {
        return yield* new ServerError({ message: `message ${id} was not found` })
      }
      const config = yield* loadConfig()
      const account = config.accounts.find((entry) => entry.id === message.accountId)
      if (account === undefined) {
        return yield* new ServerError({
          message: `account ${message.accountId} is not configured`,
        })
      }
      const bodies = yield* MessageBodies
      return yield* bodies.load({
        account,
        mailboxPath: message.mailboxPath,
        messageId: id,
        uid: message.uid,
      })
    }).pipe(Effect.mapError(toServerError)),
  setSeen: ({ ids, seen }) =>
    Effect.gen(function* setSeenMessages() {
      const config = yield* loadConfig()
      const actions = yield* MailActions
      const events = yield* ServerEvents
      const targets = yield* listMessageActionTargets(ids)
      const accounts = new Map(config.accounts.map((account) => [account.id, account]))
      let affected = 0
      const errors: string[] = []
      for (const [accountId, group] of groupTargetsByAccount(targets)) {
        const account = accounts.get(accountId)
        if (account === undefined) {
          errors.push(`account ${accountId} is not configured`)
          continue
        }
        const outcome = yield* actions.setSeen(account, group, seen)
        affected += outcome.affected
        errors.push(...outcome.errors)
      }
      const missing = new Set(ids).size - targets.length
      if (missing > 0) {
        errors.push(`${missing} message(s) were not found locally`)
      }
      yield* events.publish({ _tag: "data-changed" })
      return { affected, errors }
    }).pipe(Effect.mapError(toServerError)),
  moveMessages: ({ ids, targetMailboxId }) =>
    Effect.gen(function* moveMessages() {
      const actions = yield* MailActions
      const events = yield* ServerEvents
      const targets = yield* listMessageActionTargets(ids)
      const mailboxes = yield* listMailboxes()
      const target = mailboxes.find((row) => row.id === targetMailboxId)
      if (target === undefined) {
        return yield* new ServerError({ message: `mailbox ${targetMailboxId} was not found` })
      }
      const accountIds = new Set(targets.map((entry) => entry.accountId))
      if (accountIds.size > 1) {
        return yield* new ServerError({
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
        return yield* new ServerError({
          message: `account ${sourceAccountId} is not configured`,
        })
      }
      const outcome = yield* actions.move(account, targets, target.path)
      yield* events.publish({ _tag: "data-changed" })
      return outcome
    }).pipe(Effect.mapError(toServerError)),
  setMailboxMuted: ({ mailboxId, muted }) =>
    Effect.gen(function* muteMailbox() {
      const events = yield* ServerEvents
      yield* setMailboxMuted(mailboxId, muted)
      yield* events.publish({ _tag: "data-changed" })
    }).pipe(Effect.mapError(toServerError)),
  sync: ({ accountId, paths }) =>
    Effect.gen(function* syncMailboxes() {
      const scheduler = yield* Scheduler
      return yield* scheduler.request({ accountId, paths })
    }).pipe(Effect.mapError(toServerError)),
  discover: ({ email }) =>
    Effect.gen(function* discoverProvider() {
      const discovery = yield* Discovery
      return yield* discovery.discover(email)
    }),
  createAccount: (input) =>
    Effect.gen(function* createAccount() {
      const events = yield* ServerEvents
      const scheduler = yield* Scheduler
      const account = yield* submitAccount({
        email: input.email,
        imap: input.imap,
        label: input.label,
        name: input.name,
        password: input.password,
        smtp: input.smtp,
        username: input.username,
      })
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
    }).pipe(Effect.mapError(toServerError)),
  updateAccount: ({ id, input }) =>
    Effect.gen(function* updateConfiguredAccount() {
      const events = yield* ServerEvents
      const account = yield* updateAccount(id, {
        imap: input.imap,
        label: input.label,
        name: input.name,
        password: input.password,
        smtp: input.smtp,
        username: input.username,
      })
      yield* events.publish({ _tag: "config-changed" })
      return account
    }).pipe(Effect.mapError(toServerError)),
  accountUsername: ({ id }) =>
    Effect.gen(function* accountUsername() {
      const credential = yield* Credential
      return yield* credential
        .get(usernameReference(id))
        .pipe(Effect.orElseSucceed((): string | null => null))
    }),
  saveSyncSettings: (settings) =>
    Effect.gen(function* persistSyncSettings() {
      const events = yield* ServerEvents
      yield* updateSyncSettings(settings)
      yield* events.publish({ _tag: "config-changed" })
    }).pipe(Effect.mapError(toServerError)),
  events: () => Stream.unwrap(ServerEvents.pipe(Effect.map((events) => events.stream))),
})

export { Handlers }
