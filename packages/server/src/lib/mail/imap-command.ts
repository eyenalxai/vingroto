import type { AccountConfig } from "@vingroto/core/config/schema"
import type { ImapFlow } from "imapflow"

import { describeError } from "@vingroto/core/errors"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"

import { ImapError } from "@/lib/mail/imap-types"

const connectTimeout = Duration.seconds(30)
const commandTimeout = Duration.minutes(2)
const logoutTimeout = Duration.seconds(10)

const readRetrySchedule = Schedule.exponential("200 millis").pipe(
  Schedule.jittered,
  Schedule.upTo({ times: 2 }),
)

const toImapError = (account: AccountConfig, operation: string, cause: unknown) =>
  new ImapError({ accountId: account.id, operation, message: describeError(cause), cause })

const timedOut = (account: AccountConfig, operation: string, timeout: Duration.Duration) =>
  new ImapError({
    accountId: account.id,
    operation,
    message: `${operation} timed out after ${Duration.toSeconds(timeout)}s`,
  })

const forceCloseClient = (account: AccountConfig, client: ImapFlow) =>
  Effect.try({
    try: () => {
      client.close()
    },
    catch: (cause: unknown) => cause,
  }).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.logWarning("IMAP connection could not be force-closed").pipe(
          Effect.annotateLogs({ account: account.id, reason: describeError(error) }),
        ),
      onSuccess: () => Effect.void,
    }),
  )

const guard = Effect.fn("Imap.guard")(function* guardCommand<A>(
  account: AccountConfig,
  operation: string,
  timeout: Duration.Duration,
  run: () => Promise<A>,
): Effect.fn.Return<A, ImapError> {
  return yield* Effect.tryPromise({
    try: async () => {
      const value = await run()
      return value
    },
    catch: (cause: unknown) => toImapError(account, operation, cause),
  }).pipe(
    Effect.timeout(timeout),
    Effect.catchTag("TimeoutError", () => Effect.fail(timedOut(account, operation, timeout))),
  )
})

// Only the idempotent reads may be replayed on the same connection.
// Connection setup and flag/move/append commands are not safe to repeat blindly.
const guardRead = <A>(
  account: AccountConfig,
  operation: string,
  timeout: Duration.Duration,
  run: () => Promise<A>,
): Effect.Effect<A, ImapError> =>
  guard(account, operation, timeout, run).pipe(Effect.retry(readRetrySchedule))

const acquireMailboxLock = (
  account: AccountConfig,
  client: ImapFlow,
  mailboxPath: string,
  readOnly: boolean,
) => {
  const operation = `select ${mailboxPath}`
  return Effect.tryPromise({
    try: async () => {
      const lock = await client.getMailboxLock(mailboxPath, { readOnly })
      return lock
    },
    catch: (cause: unknown) => toImapError(account, operation, cause),
  }).pipe(
    Effect.timeout(commandTimeout),
    Effect.catchTag("TimeoutError", () =>
      forceCloseClient(account, client).pipe(
        Effect.andThen(Effect.fail(timedOut(account, operation, commandTimeout))),
      ),
    ),
    // An abandoned acquisition can still resolve later and take the lock.
    // The whole connection is closed instead of leaving it behind unreleased.
    Effect.onInterrupt(() => forceCloseClient(account, client)),
  )
}

const withMailboxLock = <A, E, R>(
  client: ImapFlow,
  account: AccountConfig,
  mailboxPath: string,
  readOnly: boolean,
  use: Effect.Effect<A, E, R>,
) =>
  Effect.scoped(
    Effect.acquireRelease(
      acquireMailboxLock(account, client, mailboxPath, readOnly),
      (lock) =>
        Effect.sync(() => {
          lock.release()
        }),
      { interruptible: true },
    ).pipe(Effect.flatMap(() => use)),
  )

const releaseClient = Effect.fn("Imap.releaseClient")(
  function* releaseConnection(account: AccountConfig, client: ImapFlow) {
    yield* guard(account, "logout", logoutTimeout, async () => client.logout()).pipe(
      Effect.catch((error) =>
        Effect.logWarning("IMAP logout failed").pipe(
          Effect.annotateLogs({ account: account.id, reason: error.message }),
        ),
      ),
    )
  },
  (effect, account, client) => Effect.ensuring(effect, forceCloseClient(account, client)),
)

export {
  commandTimeout,
  connectTimeout,
  forceCloseClient,
  guard,
  guardRead,
  releaseClient,
  withMailboxLock,
}
