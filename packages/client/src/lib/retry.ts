import { Duration, Effect, Schedule } from "effect"

import type { MailClientError } from "@/lib/api"

const retryInitialDelayMs = 250
const retryMaximumDelayMs = 5000
const readRetryTimes = 2

const retrySchedule = Schedule.exponential(Duration.millis(retryInitialDelayMs)).pipe(
  Schedule.jittered,
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, Duration.millis(retryMaximumDelayMs))),
  ),
)

// GET-shaped requests can be replayed: they change nothing on the daemon and the extra attempts stay bounded.
const readRetrySchedule = retrySchedule.pipe(Schedule.upTo({ times: readRetryTimes }))

// Failures that retrying cannot fix.
// Why: UnauthorizedError is deliberately absent — the runtime drops its cached daemon target on a 401.
// The next attempt re-reads the registration and token and recovers a restarted daemon.
const permanentFailureTags = {
  AccountNotFoundError: true,
  ClientDefect: true,
  DraftNotFoundError: true,
  InvalidRequestError: true,
  MailboxNotFoundError: true,
  MessageNotFoundError: true,
  OutboxNotFoundError: true,
} as const satisfies Partial<Record<MailClientError["_tag"], true>>

const isTransientFailure = (error: MailClientError): boolean =>
  error._tag === "HttpClientError"
    ? error.reason._tag !== "EncodeError"
    : !Object.hasOwn(permanentFailureTags, error._tag)

interface RetryTransientOptions<E> {
  readonly isTransient: (error: E) => boolean
  readonly onFailure: (error: E) => void
}

// Why: reports every attempt, retries while the failure is transient and ends the fiber on the rest.
// The permanent failure was already reported and retrying it would spin forever.
const retryTransientFailures = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options: RetryTransientOptions<E>,
): Effect.Effect<void, never, R> =>
  effect.pipe(
    Effect.tapError((error) =>
      Effect.sync(() => {
        options.onFailure(error)
      }),
    ),
    Effect.retry({ schedule: retrySchedule, while: options.isTransient }),
    Effect.ignore,
  )

export {
  isTransientFailure,
  readRetrySchedule,
  retrySchedule,
  retryTransientFailures,
  type RetryTransientOptions,
}
