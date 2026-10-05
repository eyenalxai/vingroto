import type { DraftId } from "@vingroto/core/ids"
import type { OutgoingMessage, OutboxEntry } from "@vingroto/core/protocol/outgoing"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import type { SqlError } from "effect/unstable/sql/SqlError"

import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import { AccountId, OutboxId } from "@vingroto/core/ids"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"

import type { ConfigInvalid, ConfigUnreadable } from "@/lib/config/load"

import { loadConfigFile } from "@/lib/config/load"
import { Database } from "@/lib/db/database"
import { ServerEvents } from "@/lib/events"
import { Mailer } from "@/lib/mail/mailer"
import { SentCopies, warnSentCopy } from "@/lib/mail/sent"
import {
  cancelOutboxEntry,
  deleteOutboxEntry,
  insertOutboxEntry,
  listDueOutboxEntries,
  listOutboxEntries,
  markOutboxAttempt,
  releaseOutboxEntry,
} from "@/lib/store/outbox"

const maximumAttempts = 7
const maximumRetryDelay = Duration.minutes(10)
const workerInterval = Duration.seconds(1)

// Why: the outbox persists send times instead of sleeping, so the schedule output carries the delay and the step has no duration.
const retrySchedule = Schedule.exponential("5 seconds", 2).pipe(
  Schedule.modifyDelay(({ duration }) => Effect.succeed(Duration.min(duration, maximumRetryDelay))),
  Schedule.jittered,
  Schedule.map(({ duration }) => duration),
  Schedule.modifyDelay(() => Effect.succeed(Duration.zero)),
  Schedule.upTo({ times: maximumAttempts }),
)

const nextRetryDelay = Effect.fnUntraced(function* makeNextRetryDelay(attempt: number) {
  const step = yield* Schedule.toStepWithMetadata(retrySchedule)
  let delay: Option.Option<Duration.Duration> = Option.none()
  for (let index = 0; index < attempt; index += 1) {
    delay = yield* Effect.option(
      step(null).pipe(
        // `send_at` is an integer column, so the jittered delay is persisted as whole milliseconds.
        Effect.map((metadata) => Duration.millis(Math.round(Duration.toMillis(metadata.output)))),
      ),
    )
    if (Option.isNone(delay)) {
      return Option.none()
    }
  }
  return delay
})

class AccountNotConfigured extends Schema.TaggedError<AccountNotConfigured>()(
  "AccountNotConfigured",
  {
    accountId: AccountId,
    message: Schema.String,
  },
) {}

class OutboxNotFound extends Schema.TaggedError<OutboxNotFound>()("OutboxNotFound", {
  outboxId: OutboxId,
  message: Schema.String,
}) {}

interface EnqueueInput extends OutgoingMessage {
  readonly draftId?: DraftId
}

type OutboxStoreError = EffectDrizzleQueryError | SqlError

interface OutboxShape {
  readonly enqueue: (
    input: EnqueueInput,
  ) => Effect.Effect<
    OutboxEntry,
    AccountNotConfigured | ConfigInvalid | ConfigUnreadable | OutboxStoreError
  >
  readonly list: Effect.Effect<readonly OutboxEntry[], EffectDrizzleQueryError>
  readonly cancel: (outboxId: OutboxId) => Effect.Effect<void, OutboxNotFound | OutboxStoreError>
  readonly release: (
    outboxId: OutboxId,
  ) => Effect.Effect<OutboxEntry, OutboxNotFound | EffectDrizzleQueryError>
}

const toOutgoingMessage = (entry: OutboxEntry): OutgoingMessage => ({
  accountId: entry.accountId,
  to: entry.to,
  cc: entry.cc,
  bcc: entry.bcc,
  subject: entry.subject,
  body: entry.body,
  references: entry.references,
  ...(entry.inReplyTo === null ? {} : { inReplyTo: entry.inReplyTo }),
})

class Outbox extends Context.Service<Outbox, OutboxShape>()("@vingroto/server/lib/outbox") {
  static readonly layer = Layer.effect(
    Outbox,
    Effect.gen(function* makeOutbox() {
      const database = yield* Database
      const events = yield* ServerEvents
      const mailer = yield* Mailer
      const sentCopies = yield* SentCopies
      const paths = yield* AppPaths
      const fs = yield* FileSystem.FileSystem
      const readConfig = loadConfigFile(paths.config, fs)

      const publishChanged = events.publish({ _tag: "data-changed" })

      const failAttempt = Effect.fn("Outbox.failAttempt")(function* failAttempt(
        entry: OutboxEntry,
        reason: string,
        retryable: boolean,
      ) {
        const now = yield* Clock.currentTimeMillis
        const attempts = entry.attempts + 1
        const retry = retryable && attempts < maximumAttempts
        const delay = retry ? yield* nextRetryDelay(attempts) : Option.none<Duration.Duration>()
        if (Option.isNone(delay)) {
          yield* markOutboxAttempt({
            id: entry.id,
            attempts,
            sendAt: entry.sendAt,
            state: "failed",
            lastError: reason,
          })
          yield* Effect.logWarning("outbox message failed permanently").pipe(
            Effect.annotateLogs({ outbox: entry.id, attempts, reason }),
          )
        } else {
          yield* markOutboxAttempt({
            id: entry.id,
            attempts,
            sendAt: now + Duration.toMillis(delay.value),
            state: "pending",
            lastError: reason,
          })
          yield* Effect.logWarning("outbox send failed, retrying later").pipe(
            Effect.annotateLogs({ outbox: entry.id, attempts, reason }),
          )
        }
        yield* publishChanged
      })

      const sendEntry = Effect.fn("Outbox.sendEntry")(function* sendEntry(entry: OutboxEntry) {
        const config = yield* readConfig
        const account = config.accounts.find((candidate) => candidate.id === entry.accountId)
        if (account === undefined) {
          yield* failAttempt(entry, `account ${entry.accountId} is not configured`, true)
          return
        }
        const outcome = yield* mailer.send(account, toOutgoingMessage(entry)).pipe(Effect.result)
        if (outcome._tag === "Failure") {
          const reauthorizationRequired = outcome.failure._tag === "OAuthReauthorizationRequired"
          const reason = reauthorizationRequired
            ? `${outcome.failure.message}; re-authorize the account in settings`
            : describeError(outcome.failure)
          yield* failAttempt(entry, reason, !reauthorizationRequired)
          return
        }
        yield* deleteOutboxEntry(entry.id)
        yield* sentCopies.save(account, toOutgoingMessage(entry)).pipe(
          Effect.catchTags({
            SentMailboxMissing: (error) => warnSentCopy(account, error.message),
            SentCopyAppendFailed: (error) =>
              warnSentCopy(account, error.message, error.mailboxPath),
            EffectDrizzleQueryError: (error) => warnSentCopy(account, error.message),
            SmtpError: (error) => warnSentCopy(account, error.message),
          }),
        )
        yield* publishChanged
        yield* Effect.logInfo("outbox message sent").pipe(
          Effect.annotateLogs({ outbox: entry.id, attempts: entry.attempts }),
        )
      })

      const runPass = Effect.fn("Outbox.runPass")(function* runPass() {
        const now = yield* Clock.currentTimeMillis
        const due = yield* listDueOutboxEntries(now)
        for (const entry of due) {
          yield* sendEntry(entry).pipe(
            Effect.tapError((error) =>
              Effect.logWarning("outbox entry failed").pipe(
                Effect.annotateLogs({ outbox: entry.id, reason: describeError(error) }),
              ),
            ),
            Effect.ignore,
          )
        }
      })

      yield* runPass().pipe(
        Effect.catch((error) =>
          Effect.logWarning("outbox pass failed").pipe(
            Effect.annotateLogs({ reason: describeError(error) }),
          ),
        ),
        Effect.catchDefect((defect) =>
          Effect.logWarning("outbox pass failed unexpectedly").pipe(
            Effect.annotateLogs({ reason: describeError(defect) }),
          ),
        ),
        Effect.repeat(Schedule.spaced(workerInterval)),
        Effect.forkScoped,
      )

      const enqueue = Effect.fn("Outbox.enqueue")(
        function* enqueueMessage(input: EnqueueInput) {
          const config = yield* readConfig
          const account = config.accounts.find((candidate) => candidate.id === input.accountId)
          if (account === undefined) {
            return yield* new AccountNotConfigured({
              accountId: input.accountId,
              message: `account ${input.accountId} is not configured`,
            })
          }
          const now = yield* Clock.currentTimeMillis
          const entry = yield* insertOutboxEntry(
            {
              accountId: input.accountId,
              to: input.to,
              cc: input.cc,
              bcc: input.bcc,
              subject: input.subject,
              body: input.body,
              inReplyTo: input.inReplyTo ?? null,
              references: input.references,
              sendAt: now + config.send.delaySeconds * 1000,
            },
            input.draftId,
          )
          yield* publishChanged
          return entry
        },
        Effect.provideService(Database, database),
      )

      const list = listOutboxEntries().pipe(
        Effect.provideService(Database, database),
        Effect.withSpan("Outbox.list"),
      )

      const cancel = Effect.fn("Outbox.cancel")(
        function* cancelEntry(outboxId: OutboxId) {
          const moved = yield* cancelOutboxEntry(outboxId)
          if (!moved) {
            return yield* new OutboxNotFound({
              outboxId,
              message: `outbox entry ${outboxId} was not found`,
            })
          }
          return yield* publishChanged
        },
        Effect.provideService(Database, database),
      )

      const release = Effect.fn("Outbox.release")(
        function* releaseEntry(outboxId: OutboxId) {
          const now = yield* Clock.currentTimeMillis
          const entry = yield* releaseOutboxEntry(outboxId, now)
          if (entry === undefined) {
            return yield* new OutboxNotFound({
              outboxId,
              message: `outbox entry ${outboxId} was not found`,
            })
          }
          yield* publishChanged
          return entry
        },
        Effect.provideService(Database, database),
      )

      return Outbox.of({ cancel, enqueue, list, release })
    }),
  )
}

export {
  AccountNotConfigured,
  nextRetryDelay,
  Outbox,
  OutboxNotFound,
  type EnqueueInput,
  type OutboxShape,
}
