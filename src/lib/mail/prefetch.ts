import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

import type { AccountConfig } from "@/lib/config/schema"
import type { PendingBody } from "@/lib/store/bodies"

import { Database } from "@/lib/db/database"
import { describeError } from "@/lib/errors"
import { Imap } from "@/lib/mail/imap"
import { parseMessageSource } from "@/lib/mail/parse"
import { listPendingBodies, storeMessageBody } from "@/lib/store/bodies"

interface MessagePrefetchShape {
  readonly unread: (accounts: readonly AccountConfig[]) => Effect.Effect<void>
}

interface AccountOutcome {
  readonly fetched: number
  readonly failed: number
}

const prefetchKey = (value: { readonly mailboxPath: string; readonly uid: number }) =>
  `${value.mailboxPath}\u0000${value.uid}`

const storeSource = (target: PendingBody, source: Buffer) =>
  Effect.gen(function* storePrefetchedBody() {
    const parsed = yield* parseMessageSource(source)
    yield* storeMessageBody(
      target.messageId,
      { text: parsed.text, html: parsed.html },
      parsed.attachments > 0,
    )
  })

const groupByAccount = (targets: readonly PendingBody[]) => {
  const groups = new Map<string, PendingBody[]>()
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

class MessagePrefetch extends Context.Service<MessagePrefetch, MessagePrefetchShape>()(
  "vingroto/lib/mail/MessagePrefetch",
) {
  static readonly layer = Layer.effect(
    MessagePrefetch,
    Effect.gen(function* makeMessagePrefetch() {
      const database = yield* Database
      const imap = yield* Imap
      const state = yield* Ref.make({ running: false, queued: false })
      const failed = yield* Ref.make<ReadonlySet<number>>(new Set())

      // Bodies that fail once stay skipped for this session so that every sync does not retry them.
      const recordFailure = Effect.fn("MessagePrefetch.recordFailure")(function* recordFailure(
        target: PendingBody,
        accountId: string,
        reason: string,
      ) {
        yield* Ref.update(failed, (current) => new Set(current).add(target.messageId))
        yield* Effect.logWarning("body prefetch failed").pipe(
          Effect.annotateLogs({
            account: accountId,
            mailbox: target.mailboxPath,
            uid: target.uid,
            reason,
          }),
        )
      })

      const runAccount = Effect.fn("MessagePrefetch.runAccount")(function* runAccount(
        account: AccountConfig,
        targets: readonly PendingBody[],
      ) {
        const results = yield* imap.fetchMessageSources(
          account,
          targets.map((target) => {
            return { mailboxPath: target.mailboxPath, uid: target.uid }
          }),
        )
        const targetsByKey = new Map(targets.map((target) => [prefetchKey(target), target]))
        let fetched = 0
        let failedCount = 0
        for (const result of results) {
          const target = targetsByKey.get(prefetchKey(result))
          if (target === undefined) {
            continue
          }
          if (result._tag === "error") {
            failedCount += 1
            yield* recordFailure(target, account.id, result.message)
            continue
          }
          const stored = yield* storeSource(target, result.source).pipe(
            Effect.as(true),
            Effect.catch((error) =>
              recordFailure(target, account.id, describeError(error)).pipe(Effect.as(false)),
            ),
          )
          if (stored) {
            fetched += 1
          } else {
            failedCount += 1
          }
        }
        return { fetched, failed: failedCount }
      })

      const runPass = Effect.fn("MessagePrefetch.runPass")(function* runPass(
        accounts: readonly AccountConfig[],
      ) {
        const pending = yield* listPendingBodies()
        const skipped = yield* Ref.get(failed)
        const targets = pending.filter((target) => !skipped.has(target.messageId))
        if (targets.length === 0) {
          yield* Effect.logDebug("no unread bodies to prefetch")
          return
        }
        yield* Effect.logInfo("prefetching unread bodies").pipe(
          Effect.annotateLogs({ messages: targets.length }),
        )
        let fetched = 0
        let failedCount = 0
        for (const [accountId, rows] of groupByAccount(targets)) {
          const account = accounts.find((entry) => entry.id === accountId)
          if (account === undefined) {
            yield* Effect.logDebug("skipping bodies of an unconfigured account").pipe(
              Effect.annotateLogs({ account: accountId, messages: rows.length }),
            )
            continue
          }
          const outcome = yield* runAccount(account, rows).pipe(
            Effect.catch((error) =>
              Effect.logWarning("body prefetch failed for an account").pipe(
                Effect.annotateLogs({ account: accountId, reason: describeError(error) }),
                Effect.as<AccountOutcome>({ fetched: 0, failed: 0 }),
              ),
            ),
          )
          fetched += outcome.fetched
          failedCount += outcome.failed
        }
        yield* Effect.logInfo("body prefetch finished").pipe(
          Effect.annotateLogs({ messages: targets.length, fetched, failed: failedCount }),
        )
      })

      const unread = Effect.fn("MessagePrefetch.unread")(function* prefetchUnread(
        accounts: readonly AccountConfig[],
      ) {
        const alreadyRunning = yield* Ref.modify(state, (current) =>
          current.running
            ? [true, { running: true, queued: true }]
            : [false, { running: true, queued: false }],
        )
        if (alreadyRunning) {
          return
        }
        yield* Effect.gen(function* drainPrefetch() {
          let again = true
          while (again) {
            yield* runPass(accounts).pipe(
              Effect.catch((error) =>
                Effect.logWarning("body prefetch query failed").pipe(
                  Effect.annotateLogs({ reason: describeError(error) }),
                ),
              ),
            )
            again = yield* Ref.modify(state, (current) => [
              current.queued,
              { running: current.queued, queued: false },
            ])
          }
        }).pipe(
          Effect.ensuring(Ref.set(state, { running: false, queued: false })),
          Effect.provideService(Database, database),
          Effect.provideService(Imap, imap),
        )
      })

      return MessagePrefetch.of({
        unread: (accounts) => unread(accounts),
      })
    }),
  )
}

export { MessagePrefetch, type MessagePrefetchShape }
