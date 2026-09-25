import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId, MessageId, Uid } from "@vingroto/core/ids"

import { describeError } from "@vingroto/core/errors"
import * as Cache from "effect/Cache"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"

import type { PendingBody } from "@/lib/store/bodies"

import { Database } from "@/lib/db/database"
import { Imap } from "@/lib/mail/imap"
import { parseMessageSource } from "@/lib/mail/parse"
import { listPendingBodies, storeMessageBody } from "@/lib/store/bodies"

interface MessagePrefetchShape {
  readonly unread: (accounts: readonly AccountConfig[]) => Effect.Effect<void>
}

interface PrefetchState {
  readonly running: boolean
  readonly queued: boolean
  readonly owner: number | undefined
}

const prefetchChunkSize = 200
const failureTimeToLive = Duration.minutes(10)
const failureCapacity = 1024

const prefetchKey = (value: { readonly mailboxPath: string; readonly uid: Uid }) =>
  `${value.mailboxPath}\u0000${value.uid}`

const storeSource = Effect.fn("MessagePrefetch.storeSource")(function* storePrefetchedBody(
  target: PendingBody,
  source: Buffer,
) {
  const parsed = yield* parseMessageSource(source)
  yield* storeMessageBody(
    target.messageId,
    { text: parsed.text, html: parsed.html },
    parsed.attachments > 0,
  )
})

const groupByAccount = (targets: readonly PendingBody[]) => {
  const groups = new Map<AccountId, PendingBody[]>()
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
  "@vingroto/server/lib/mail/prefetch/MessagePrefetch",
) {
  static readonly layer = Layer.effect(
    MessagePrefetch,
    Effect.gen(function* makeMessagePrefetch() {
      const database = yield* Database
      const imap = yield* Imap
      const state = yield* Ref.make<PrefetchState>({
        running: false,
        queued: false,
        owner: undefined,
      })
      // Bodies that fail stay skipped until their entry expires, so a sync does not retry them forever.
      const failed = yield* Cache.make<MessageId, true>({
        capacity: failureCapacity,
        lookup: () => Effect.succeed(true),
        timeToLive: failureTimeToLive,
      })

      const rememberFailure = (messageId: MessageId) => Cache.set(failed, messageId, true)

      const recordFailure = Effect.fn("MessagePrefetch.recordFailure")(function* recordFailure(
        target: PendingBody,
        accountId: AccountId,
        reason: string,
      ) {
        yield* rememberFailure(target.messageId)
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
        const targetsByKey = new Map(targets.map((target) => [prefetchKey(target), target]))
        const handled = new Set<string>()
        let fetched = 0
        let failedCount = 0
        yield* imap
          .fetchMessageSources(
            account,
            targets.map((target) => {
              return { mailboxPath: target.mailboxPath, uid: target.uid }
            }),
          )
          .pipe(
            Stream.runForEach((result) =>
              Effect.gen(function* consumeSource() {
                const key = prefetchKey(result)
                const target = targetsByKey.get(key)
                if (target === undefined) {
                  return
                }
                handled.add(key)
                if (result._tag === "error") {
                  failedCount += 1
                  yield* recordFailure(target, account.id, result.message)
                  return
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
              }),
            ),
            Effect.catch((error) =>
              Effect.gen(function* failRemaining() {
                const reason = describeError(error)
                for (const target of targets) {
                  const key = prefetchKey(target)
                  if (handled.has(key)) {
                    continue
                  }
                  failedCount += 1
                  yield* recordFailure(target, account.id, reason)
                }
                yield* Effect.logWarning("body prefetch failed for an account").pipe(
                  Effect.annotateLogs({
                    account: account.id,
                    messages: targets.length - handled.size,
                    reason,
                  }),
                )
              }),
            ),
          )
        return { fetched, failed: failedCount }
      })

      const runChunk = Effect.fn("MessagePrefetch.runChunk")(function* runChunk(
        accounts: readonly AccountConfig[],
        targets: readonly PendingBody[],
      ) {
        yield* Effect.logDebug("prefetching unread bodies").pipe(
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
            for (const target of rows) {
              yield* rememberFailure(target.messageId)
            }
            continue
          }
          const outcome = yield* runAccount(account, rows)
          fetched += outcome.fetched
          failedCount += outcome.failed
        }
        yield* Effect.logInfo("body prefetch finished").pipe(
          Effect.annotateLogs({ messages: targets.length, fetched, failed: failedCount }),
        )
      })

      const runSnapshot = Effect.fn("MessagePrefetch.runSnapshot")(function* runSnapshot(
        accounts: readonly AccountConfig[],
      ) {
        const pending = yield* listPendingBodies().pipe(
          Effect.catch((error) =>
            Effect.logWarning("body prefetch query failed").pipe(
              Effect.annotateLogs({ reason: describeError(error) }),
              Effect.as<readonly PendingBody[]>([]),
            ),
          ),
        )
        let index = 0
        while (index < pending.length) {
          const chunk: PendingBody[] = []
          while (index < pending.length && chunk.length < prefetchChunkSize) {
            const target = pending[index]
            index += 1
            if (target === undefined || (yield* Cache.has(failed, target.messageId))) {
              continue
            }
            chunk.push(target)
          }
          if (chunk.length > 0) {
            yield* runChunk(accounts, chunk)
          }
        }
      })

      const unread = Effect.fn("MessagePrefetch.unread")(
        function* prefetchUnread(accounts: readonly AccountConfig[]) {
          const owner = yield* Effect.fiberId
          const alreadyRunning = yield* Ref.modify(
            state,
            (current): readonly [boolean, PrefetchState] =>
              current.running
                ? [true, { ...current, queued: true }]
                : [false, { running: true, queued: false, owner }],
          )
          if (alreadyRunning) {
            return
          }
          yield* Effect.gen(function* drainPrefetch() {
            let again = true
            while (again) {
              yield* runSnapshot(accounts)
              again = yield* Ref.modify(state, (current): readonly [boolean, PrefetchState] => {
                if (current.owner !== owner) {
                  return [false, current]
                }
                if (current.queued) {
                  return [true, { running: true, queued: false, owner }]
                }
                return [false, { running: false, queued: false, owner: undefined }]
              })
            }
          }).pipe(
            Effect.ensuring(
              Ref.update(state, (current) =>
                current.owner === owner
                  ? { running: false, queued: false, owner: undefined }
                  : current,
              ),
            ),
          )
        },
        Effect.provideService(Database, database),
      )

      return MessagePrefetch.of({ unread })
    }),
  )
}

export { MessagePrefetch, type MessagePrefetchShape }
