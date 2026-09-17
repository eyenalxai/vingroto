import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"

import type { AccountConfig, SyncConfig } from "@/lib/config/schema"
import type {
  MailboxSnapshot,
  MailboxWindowRequest,
  MailboxWindowResult,
} from "@/lib/mail/imap-types"
import type { MailboxRow } from "@/lib/store/mailboxes"

import { Database } from "@/lib/db/database"
import { describeError } from "@/lib/errors"
import { Imap } from "@/lib/mail/imap"
import { listAccountMailboxes, setMailboxSyncState, upsertMailboxes } from "@/lib/store/mailboxes"
import { deleteMailboxMessages, storeMessages } from "@/lib/store/messages"

const dayMilliseconds = 24 * 60 * 60 * 1000

type SyncEvent =
  | {
      readonly _tag: "mailbox-done"
      readonly accountId: string
      readonly path: string
      readonly fetched: number
      readonly stored: number
    }
  | {
      readonly _tag: "mailbox-error"
      readonly accountId: string
      readonly path: string
      readonly message: string
    }
  | { readonly _tag: "sync-error"; readonly accountId: string; readonly message: string }

interface SyncReport {
  readonly accountId: string
  readonly mailboxes: number
  readonly fetched: number
  readonly stored: number
  readonly errors: readonly string[]
}

interface SyncShape {
  readonly events: Stream.Stream<SyncEvent>
  readonly syncMailboxes: (
    account: AccountConfig,
    config: SyncConfig,
    paths: readonly string[] | undefined,
  ) => Effect.Effect<SyncReport>
}

const initialWindow = (row: MailboxRow, config: SyncConfig, now: number): MailboxWindowRequest => {
  return {
    path: row.path,
    since: new Date(now - config.initialDays * dayMilliseconds),
    fromUid: undefined,
  }
}

const toWindowRequest = (
  row: MailboxRow,
  config: SyncConfig,
  now: number,
): MailboxWindowRequest => {
  if (row.synced_at === null) {
    return initialWindow(row, config, now)
  }
  if (row.last_seen_uid > 0) {
    return { path: row.path, fromUid: row.last_seen_uid + 1, since: undefined }
  }
  // Synced before without a UID watermark: rewind a day to cover day-granular date searches.
  return { path: row.path, since: new Date(row.synced_at - dayMilliseconds), fromUid: undefined }
}

const emptyReport = (account: AccountConfig): SyncReport => {
  return { accountId: account.id, mailboxes: 0, fetched: 0, stored: 0, errors: [] }
}

const describeSyncEvent = (event: SyncEvent) => {
  if (event._tag === "mailbox-done") {
    return event.stored === 0 ? `${event.path} · up to date` : `${event.path} · ${event.stored} new`
  }
  if (event._tag === "mailbox-error") {
    return `${event.path} · ${event.message}`
  }
  return `sync failed · ${event.message}`
}

class SyncEngine extends Context.Service<SyncEngine, SyncShape>()("vingroto/lib/mail/SyncEngine") {
  static readonly layer = Layer.effect(
    SyncEngine,
    Effect.gen(function* makeSyncEngine() {
      const imap = yield* Imap
      const database = yield* Database
      const pubsub = yield* PubSub.unbounded<SyncEvent>()
      const busy = yield* Ref.make(false)

      const emit = (event: SyncEvent) => PubSub.publish(pubsub, event)

      const storeSnapshot = Effect.fn("Sync.storeSnapshot")(function* storeSnapshot(
        account: AccountConfig,
        row: MailboxRow,
        snapshot: MailboxSnapshot,
      ) {
        let lastSeenUid = row.last_seen_uid
        for (const message of snapshot.messages) {
          lastSeenUid = Math.max(lastSeenUid, message.uid)
        }
        const outcome = yield* storeMessages({
          accountId: account.id,
          mailboxId: row.id,
          envelopes: snapshot.messages,
        })
        yield* setMailboxSyncState(row.id, {
          uidValidity: snapshot.uidValidity,
          lastSeenUid,
          syncedAt: yield* Clock.currentTimeMillis,
        })
        yield* Effect.logInfo("mailbox synced").pipe(
          Effect.annotateLogs({
            account: account.id,
            mailbox: row.path,
            fetched: snapshot.messages.length,
            stored: outcome.inserted,
          }),
        )
        yield* emit({
          _tag: "mailbox-done",
          accountId: account.id,
          path: row.path,
          fetched: snapshot.messages.length,
          stored: outcome.inserted,
        })
        return { fetched: snapshot.messages.length, stored: outcome.inserted }
      })

      const syncAccount = Effect.fn("Sync.syncAccount")(function* syncAccount(
        account: AccountConfig,
        config: SyncConfig,
        paths: readonly string[] | undefined,
      ) {
        const now = yield* Clock.currentTimeMillis
        const infos = yield* imap.listMailboxes(account)
        yield* upsertMailboxes(account.id, infos)
        const stored = yield* listAccountMailboxes(account.id)
        const targets = stored.filter(
          (row) => row.selectable && (paths === undefined || paths.includes(row.path)),
        )
        const rowsByPath = new Map(stored.map((row) => [row.path, row]))
        const results = yield* imap.fetchMailboxWindows(
          account,
          targets.map((row) => toWindowRequest(row, config, now)),
        )
        const errors: string[] = []
        const recreated = new Set<number>()
        const processable: { readonly row: MailboxRow; readonly result: MailboxWindowResult }[] = []
        for (const result of results) {
          const row = rowsByPath.get(result.path)
          if (row === undefined) {
            continue
          }
          if (result._tag === "error") {
            errors.push(`${result.path}: ${result.message}`)
            yield* Effect.logWarning("mailbox sync failed").pipe(
              Effect.annotateLogs({
                account: account.id,
                mailbox: result.path,
                reason: result.message,
              }),
            )
            yield* emit({
              _tag: "mailbox-error",
              accountId: account.id,
              path: result.path,
              message: result.message,
            })
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
              lastSeenUid: 0,
              syncedAt: null,
            })
            recreated.add(row.id)
            continue
          }
          processable.push({ row, result })
        }
        if (recreated.size > 0) {
          const refreshed = yield* listAccountMailboxes(account.id)
          const refreshedByPath = new Map(refreshed.map((row) => [row.path, row]))
          const retry = yield* imap.fetchMailboxWindows(
            account,
            refreshed
              .filter((row) => recreated.has(row.id))
              .map((row) => initialWindow(row, config, now)),
          )
          for (const result of retry) {
            const row = refreshedByPath.get(result.path)
            if (row !== undefined) {
              processable.push({ row, result })
            }
          }
        }
        let fetched = 0
        let storedCount = 0
        for (const entry of processable) {
          if (entry.result._tag === "error") {
            errors.push(`${entry.result.path}: ${entry.result.message}`)
            yield* Effect.logWarning("mailbox sync failed").pipe(
              Effect.annotateLogs({
                account: account.id,
                mailbox: entry.result.path,
                reason: entry.result.message,
              }),
            )
            yield* emit({
              _tag: "mailbox-error",
              accountId: account.id,
              path: entry.result.path,
              message: entry.result.message,
            })
            continue
          }
          const outcome = yield* storeSnapshot(account, entry.row, entry.result.snapshot)
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

      const syncMailboxes = Effect.fn("Sync.syncMailboxes")(function* syncMailboxes(
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
              yield* emit({ _tag: "sync-error", accountId: account.id, message })
              return { ...emptyReport(account), errors: [message] }
            }),
          ),
          Effect.ensuring(Ref.set(busy, false)),
        )
      })

      return SyncEngine.of({
        events: Stream.fromPubSub(pubsub),
        syncMailboxes: (account, config, paths) => {
          const program = syncMailboxes(account, config, paths).pipe(
            Effect.provideService(Database, database),
          )
          return program
        },
      })
    }),
  )
}

export { SyncEngine, describeSyncEvent, type SyncEvent, type SyncReport, type SyncShape }
