import type { AccountConfig, SyncConfig } from "@vingroto/core/config/schema"
import type { AccountId } from "@vingroto/core/ids"
import type { Mailbox, SyncFailure, SyncReport } from "@vingroto/core/protocol/mail"

import { describeError } from "@vingroto/core/errors"
import { Uid } from "@vingroto/core/ids"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

import type { MailboxSnapshot, MailboxWindowRequest } from "@/lib/mail/imap-types"

import { Database } from "@/lib/db/database"
import { ServerEvents } from "@/lib/events"
import { Imap } from "@/lib/mail/imap"
import { NewMailNotifier } from "@/lib/notify/new-mail"
import { listAccountMailboxes, setMailboxSyncState, upsertMailboxes } from "@/lib/store/mailboxes"
import { replaceMailboxMessages, storeMessages } from "@/lib/store/messages"

interface SyncShape {
  readonly syncMailboxes: (
    account: AccountConfig,
    config: SyncConfig,
    paths: readonly string[] | undefined,
  ) => Effect.Effect<SyncReport>
}

const mailboxFailure = (accountId: AccountId, path: string, message: string): SyncFailure => {
  return { _tag: "mailbox", accountId, mailboxPath: path, message }
}

const initialWindow = (
  row: Mailbox,
  config: SyncConfig,
  now: DateTime.Utc,
): MailboxWindowRequest => {
  return {
    path: row.path,
    since: DateTime.subtract(now, { days: config.initialDays }),
    fromUid: undefined,
  }
}

const toWindowRequest = (
  row: Mailbox,
  config: SyncConfig,
  now: DateTime.Utc,
): MailboxWindowRequest => {
  if (row.syncedAt === null) {
    return initialWindow(row, config, now)
  }
  if (row.lastSeenUid > 0) {
    return { path: row.path, fromUid: Uid.make(row.lastSeenUid + 1), since: undefined }
  }
  // Synced before without a UID watermark: rewind a day to cover day-granular date searches.
  return {
    path: row.path,
    since: DateTime.subtract(DateTime.makeUnsafe(row.syncedAt), { days: 1 }),
    fromUid: undefined,
  }
}

const emptyReport = (account: AccountConfig): SyncReport => {
  return { accountId: account.id, mailboxes: 0, fetched: 0, stored: 0, errors: [] }
}

class SyncEngine extends Context.Service<SyncEngine, SyncShape>()(
  "@vingroto/server/lib/mail/sync/SyncEngine",
) {
  static readonly layer = Layer.effect(
    SyncEngine,
    Effect.gen(function* makeSyncEngine() {
      const imap = yield* Imap
      const database = yield* Database
      const events = yield* ServerEvents
      const notifier = yield* NewMailNotifier
      const busy = yield* Ref.make(false)

      const reportMailboxError = Effect.fn("Sync.reportMailboxError")(
        function* reportMailboxFailure(account: AccountConfig, path: string, message: string) {
          yield* Effect.logWarning("mailbox sync failed").pipe(
            Effect.annotateLogs({ account: account.id, mailbox: path, reason: message }),
          )
          yield* events.publish({ _tag: "mailbox-error", accountId: account.id, path, message })
        },
      )

      const announceStored = Effect.fn("Sync.announceStored")(function* announceMailboxStored(
        account: AccountConfig,
        row: Mailbox,
        fetched: number,
        stored: number,
        reset: boolean,
      ) {
        yield* events.publish({
          _tag: "mailbox-done",
          accountId: account.id,
          path: row.path,
          fetched,
          stored,
          reset,
        })
        yield* notifier.mailboxStored({ account, mailbox: row, stored, reset })
      })

      const storeSnapshot = Effect.fn("Sync.storeSnapshot")(function* storeSnapshot(
        account: AccountConfig,
        row: Mailbox,
        snapshot: MailboxSnapshot,
      ) {
        let lastSeenUid: number = row.lastSeenUid
        for (const message of snapshot.messages) {
          lastSeenUid = Math.max(lastSeenUid, message.uid)
        }
        const outcome = yield* storeMessages({
          accountId: account.id,
          mailboxId: row.id,
          envelopes: snapshot.messages,
        })
        const syncedAt = yield* DateTime.now
        yield* setMailboxSyncState(row.id, {
          uidValidity: snapshot.uidValidity,
          lastSeenUid: Uid.make(lastSeenUid),
          syncedAt: DateTime.toEpochMillis(syncedAt),
        })
        yield* Effect.logInfo("mailbox synced").pipe(
          Effect.annotateLogs({
            account: account.id,
            mailbox: row.path,
            fetched: snapshot.messages.length,
            stored: outcome.inserted,
          }),
        )
        yield* announceStored(account, row, snapshot.messages.length, outcome.inserted, false)
        return { fetched: snapshot.messages.length, stored: outcome.inserted }
      })

      const storeReplacement = Effect.fn("Sync.storeReplacement")(function* storeReplacement(
        account: AccountConfig,
        row: Mailbox,
        snapshot: MailboxSnapshot,
      ) {
        const fetched = snapshot.messages.length
        const syncedAt = yield* DateTime.now
        yield* replaceMailboxMessages({
          accountId: account.id,
          mailboxId: row.id,
          envelopes: snapshot.messages,
          uidValidity: snapshot.uidValidity,
          syncedAt: DateTime.toEpochMillis(syncedAt),
        })
        yield* Effect.logInfo("mailbox cache replaced").pipe(
          Effect.annotateLogs({
            account: account.id,
            mailbox: row.path,
            fetched,
          }),
        )
        yield* announceStored(account, row, fetched, fetched, true)
        return { fetched, stored: fetched }
      })

      const syncAccount = Effect.fn("Sync.syncAccount")(function* syncAccount(
        account: AccountConfig,
        config: SyncConfig,
        paths: readonly string[] | undefined,
      ) {
        const now = yield* DateTime.now
        const infos = yield* imap.listMailboxes(account)
        yield* upsertMailboxes(account.id, infos)
        const stored = yield* listAccountMailboxes(account.id)
        const targets = stored.filter(
          (row) => row.selectable && (paths === undefined || paths.includes(row.path)),
        )
        for (const row of targets) {
          yield* events.publish({ _tag: "mailbox-start", accountId: account.id, path: row.path })
        }
        const rowsByPath = new Map(stored.map((row) => [row.path, row]))
        const results = yield* imap.fetchMailboxWindows(
          account,
          targets.map((row) => toWindowRequest(row, config, now)),
        )
        const errors: SyncFailure[] = []
        const recreated: Mailbox[] = []
        const processable: {
          readonly row: Mailbox
          readonly snapshot: MailboxSnapshot
          readonly reset: boolean
        }[] = []
        for (const result of results) {
          const row = rowsByPath.get(result.path)
          if (row === undefined) {
            continue
          }
          if (result._tag === "error") {
            errors.push(mailboxFailure(account.id, result.path, result.message))
            yield* reportMailboxError(account, result.path, result.message)
            continue
          }
          if (row.uidValidity !== null && row.uidValidity !== result.snapshot.uidValidity) {
            // The server reassigned the UID space: every cached UID for this mailbox is meaningless.
            // The cached window is kept until the replacement fetch succeeds, so a failure leaves it intact.
            yield* Effect.logWarning("uid validity changed, refreshing mailbox from scratch").pipe(
              Effect.annotateLogs({
                account: account.id,
                mailbox: row.path,
                previous: row.uidValidity,
                current: result.snapshot.uidValidity,
              }),
            )
            recreated.push(row)
            continue
          }
          processable.push({ row, snapshot: result.snapshot, reset: false })
        }
        if (recreated.length > 0) {
          for (const row of recreated) {
            yield* events.publish({ _tag: "mailbox-start", accountId: account.id, path: row.path })
          }
          const refreshed = yield* imap.fetchMailboxWindows(
            account,
            recreated.map((row) => initialWindow(row, config, now)),
          )
          const recreatedByPath = new Map(recreated.map((row) => [row.path, row]))
          for (const result of refreshed) {
            const row = recreatedByPath.get(result.path)
            if (row === undefined) {
              continue
            }
            if (result._tag === "error") {
              errors.push(mailboxFailure(account.id, result.path, result.message))
              yield* reportMailboxError(account, result.path, result.message)
              continue
            }
            processable.push({ row, snapshot: result.snapshot, reset: true })
          }
        }
        let fetched = 0
        let storedCount = 0
        for (const entry of processable) {
          const outcome = entry.reset
            ? yield* storeReplacement(account, entry.row, entry.snapshot)
            : yield* storeSnapshot(account, entry.row, entry.snapshot)
          fetched += outcome.fetched
          storedCount += outcome.stored
        }
        yield* Effect.logDebug("account synced").pipe(
          Effect.annotateLogs({
            account: account.id,
            mailboxes: targets.length,
            fetched,
            stored: storedCount,
            errors: errors.length,
          }),
        )
        return {
          accountId: account.id,
          mailboxes: targets.length,
          fetched,
          stored: storedCount,
          errors,
        } satisfies SyncReport
      })

      const syncMailboxes = Effect.fn("Sync.syncMailboxes")(
        function* syncMailboxes(
          account: AccountConfig,
          config: SyncConfig,
          paths: readonly string[] | undefined,
        ) {
          const acquired = yield* Ref.modify(busy, (running) => [!running, true])
          if (!acquired) {
            return emptyReport(account)
          }
          return yield* syncAccount(account, config, paths).pipe(
            Effect.catch((error) =>
              Effect.gen(function* reportFailure() {
                const message = describeError(error)
                yield* events.publish({ _tag: "sync-error", accountId: account.id, message })
                const failure: SyncFailure = { _tag: "sync", accountId: account.id, message }
                return { ...emptyReport(account), errors: [failure] }
              }),
            ),
            Effect.ensuring(Ref.set(busy, false)),
          )
        },
        Effect.provideService(Database, database),
      )

      return SyncEngine.of({ syncMailboxes })
    }),
  )
}

export { SyncEngine, type SyncShape }
