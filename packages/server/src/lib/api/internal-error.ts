import { describeError } from "@vingroto/core/errors"
import { InternalError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"

const internalMessage = "the request could not be completed"

const internalFailure = Effect.fnUntraced(function* internalFailure(error: unknown) {
  yield* Effect.logError("request failed").pipe(
    Effect.annotateLogs({ reason: describeError(error) }),
  )
  return yield* new InternalError({ message: internalMessage })
})

const sanitizeFailure = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, InternalError, R> => Effect.catchTags(effect, {}, internalFailure)

export { internalFailure, sanitizeFailure }
