import type { AccountConfig, SyncConfig } from "@vingroto/core/config/schema"
import type { AccountId } from "@vingroto/core/ids"

import { describeError } from "@vingroto/core/errors"
import { Uid } from "@vingroto/core/ids"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

import type {
  MailboxSnapshot,
  MailboxWindowRequest,
  MailboxWindowResult,
} from "@/lib/mail/imap-types"
import type { MailboxRow } from "@/lib/store/mailboxes"

import { Database } from "@/lib/db/database"
import { ServerEvents } from "@/lib/events"
import { Imap } from "@/lib/mail/imap"
import { listAccountMailboxes, setMailboxSyncState, upsertMailboxes } from "@/lib/store/mailboxes"
import { deleteMailboxMessages, storeMessages } from "@/lib/store/messages"

interface SyncReport {
  readonly accountId: AccountId
  readonly mailboxes: number
  readonly fetched: number
  readonly stored: number
  readonly errors: readonly string[]
}

interface SyncShape {
  readonly syncMailboxes: (
    account: AccountConfig,
    config: SyncConfig,
    paths: readonly string[] | undefined,
  ) => Effect.Effect<SyncReport>
}

const initialWindow = (
  row: MailboxRow,
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
  row: MailboxRow,
  config: SyncConfig,
  now: DateTime.Utc,
): MailboxWindowRequest => {
  if (row.synced_at === null) {
    return initialWindow(row, config, now)
  }
  if (row.last_seen_uid > 0) {
    return { path: row.path, fromUid: Uid.make(row.last_seen_uid + 1), since: undefined }
  }
  // Synced before without a UID watermark: rewind a day to cover day-granular date searches.
  return {
    path: row.path,
    since: DateTime.subtract(DateTime.makeUnsafe(row.synced_at), { days: 1 }),
    fromUid: undefined,
  }
}

const emptyReport = (account: AccountConfig): SyncReport => {
  return { accountId: account.id, mailboxes: 0, fetched: 0, stored: 0, errors: [] }
}

class SyncEngine extends Context.Service<SyncEngine, SyncShape>()("vingroto/lib/mail/SyncEngine") {
  static readonly layer = Layer.effect(
    SyncEngine,
    Effect.gen(function* makeSyncEngine() {
      const imap = yield* Imap
      const database = yield* Database
      const events = yield* ServerEvents
      const busy = yield* Ref.make(false)

      const reportMailboxError = Effect.fn("Sync.reportMailboxError")(
        function* reportMailboxFailure(account: AccountConfig, path: string, message: string) {
          yield* Effect.logWarning("mailbox sync failed").pipe(
            Effect.annotateLogs({ account: account.id, mailbox: path, reason: message }),
          )
          yield* events.publish({ _tag: "mailbox-error", accountId: account.id, path, message })
        },
      )

      const storeSnapshot = Effect.fn("Sync.storeSnapshot")(function* storeSnapshot(
        account: AccountConfig,
        row: MailboxRow,
        snapshot: MailboxSnapshot,
        reset: boolean,
      ) {
        let lastSeenUid: number = row.last_seen_uid
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
        yield* events.publish({
          _tag: "mailbox-done",
          accountId: account.id,
          path: row.path,
          fetched: snapshot.messages.length,
          stored: outcome.inserted,
          reset,
        })
        return { fetched: snapshot.messages.length, stored: outcome.inserted }
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
        const errors: string[] = []
        const recreated = new Set<number>()
        const processable: {
          readonly row: MailboxRow
          readonly result: MailboxWindowResult
          readonly reset: boolean
        }[] = []
        for (const result of results) {
          const row = rowsByPath.get(result.path)
          if (row === undefined) {
            continue
          }
          if (result._tag === "error") {
            errors.push(`${result.path}: ${result.message}`)
            yield* reportMailboxError(account, result.path, result.message)
            continue
          }
          if (row.uid_validity !== null && row.uid_validity !== result.snapshot.uidValidity) {
            // The server reassigned the UID space: every cached UID for this mailbox is meaningless.
            yield* Effect.logWarning("uid validity changed, dropping cached messages").pipe(
              Effect.annotateLogs({
                account: account.id,
                mailbox: row.path,
                previous: row.uid_validity,
                current: result.snapshot.uidValidity,
              }),
            )
            yield* deleteMailboxMessages(row.id)
            yield* setMailboxSyncState(row.id, {
              uidValidity: result.snapshot.uidValidity,
              lastSeenUid: Uid.make(0),
              syncedAt: null,
            })
            recreated.add(row.id)
            continue
          }
          processable.push({ row, result, reset: false })
        }
        if (recreated.size > 0) {
          const refreshed = yield* listAccountMailboxes(account.id)
          const refreshedByPath = new Map(refreshed.map((row) => [row.path, row]))
          const retryRows = refreshed.filter((row) => recreated.has(row.id))
          for (const row of retryRows) {
            yield* events.publish({ _tag: "mailbox-start", accountId: account.id, path: row.path })
          }
          const retry = yield* imap.fetchMailboxWindows(
            account,
            retryRows.map((row) => initialWindow(row, config, now)),
          )
          for (const result of retry) {
            const row = refreshedByPath.get(result.path)
            if (row !== undefined) {
              processable.push({ row, result, reset: true })
            }
          }
        }
        let fetched = 0
        let storedCount = 0
        for (const entry of processable) {
          if (entry.result._tag === "error") {
            errors.push(`${entry.result.path}: ${entry.result.message}`)
            yield* reportMailboxError(account, entry.result.path, entry.result.message)
            continue
          }
          const outcome = yield* storeSnapshot(
            account,
            entry.row,
            entry.result.snapshot,
            entry.reset,
          )
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
        const report: SyncReport = {
          accountId: account.id,
          mailboxes: targets.length,
          fetched,
          stored: storedCount,
          errors,
        }
        return report
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
                return { ...emptyReport(account), errors: [message] }
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

export { SyncEngine, type SyncReport, type SyncShape }
