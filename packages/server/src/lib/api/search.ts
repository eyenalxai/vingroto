import { describeError } from "@vingroto/core/errors"
import { InvalidRequestError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import type { SearchError } from "@/lib/mail/search"

import { ServerApi } from "@/lib/api/api"
import { internalFailure } from "@/lib/api/internal-error"
import { limitFromQuery, scopeFromQuery } from "@/lib/api/list-scope"
import { Search } from "@/lib/mail/search"

const catchSearchFailures = <A, R>(effect: Effect.Effect<A, SearchError, R>) =>
  Effect.catchTags(
    effect,
    {
      ConfigInvalid: (error) =>
        Effect.fail(
          new InvalidRequestError({
            message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
          }),
        ),
      ConfigUnreadable: (error) => Effect.fail(new InvalidRequestError({ message: error.message })),
    },
    internalFailure,
  )

const SearchHandlers = HttpApiBuilder.group(ServerApi, "search", (handlers) =>
  handlers
    .handle("search.messages", ({ query }) =>
      Effect.gen(function* searchMessages() {
        const scope = yield* scopeFromQuery(query)
        const limit = yield* limitFromQuery(query)
        return yield* Search.pipe(
          Effect.flatMap((search) => search.messages({ query: query.query, scope }, limit)),
          catchSearchFailures,
        )
      }),
    )
    .handle("search.marks", ({ query }) =>
      Effect.gen(function* searchMarks() {
        const scope = yield* scopeFromQuery(query)
        return yield* Search.pipe(
          Effect.flatMap((search) => search.marks({ query: query.query, scope })),
          catchSearchFailures,
        )
      }),
    )
    .handle("search.start", ({ payload }) =>
      Effect.gen(function* startSearch() {
        const scope = yield* scopeFromQuery(payload)
        return yield* Search.pipe(
          Effect.flatMap((search) => search.start({ query: payload.query, scope })),
          catchSearchFailures,
        )
      }),
    ),
)

export { SearchHandlers }
