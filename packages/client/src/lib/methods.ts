import type { SchemaError } from "effect/Schema"

import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"

import type { MailClientError } from "@/lib/api"

import { ClientDefect } from "@/lib/api"
import { isTransientFailure, readRetrySchedule } from "@/lib/retry"

// Why: defects and schema mismatches would otherwise kill the calling fiber silently.
// They are contract problems the caller cannot act on, so they surface as ClientDefect.
const makeClientMethods = (invalidateTarget: Effect.Effect<void>) => {
  const clientMethod = <A, R>(
    operation: string,
    effect: Effect.Effect<A, MailClientError | SchemaError, R>,
  ) => {
    const label = `MailClient.${operation}`
    return effect.pipe(
      Effect.withSpan(label),
      // A 401 means the cached target may be stale; the next attempt re-resolves the registration and token.
      Effect.tapError((error) =>
        error._tag === "UnauthorizedError" ? invalidateTarget : Effect.void,
      ),
      Effect.catchDefect((defect) =>
        Effect.fail(new ClientDefect({ operation: label, message: describeError(defect) })),
      ),
      Effect.mapError((error): MailClientError =>
        error._tag === "SchemaError"
          ? new ClientDefect({ operation: label, message: describeError(error) })
          : error,
      ),
    )
  }

  // GET-shaped calls replay safely, so they get a bounded retry over the shared transient policy.
  const readMethod = <A, R>(
    operation: string,
    effect: Effect.Effect<A, MailClientError | SchemaError, R>,
  ) =>
    clientMethod(operation, effect).pipe(
      Effect.retry({ schedule: readRetrySchedule, while: isTransientFailure }),
    )

  return { clientMethod, readMethod }
}

export { makeClientMethods }
