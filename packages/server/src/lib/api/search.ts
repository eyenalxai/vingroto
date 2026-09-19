import type { InternalError } from "@vingroto/core/protocol/api/errors"

import { describeError } from "@vingroto/core/errors"
import { InvalidRequestError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import type { SearchError } from "@/lib/mail/search"

import { ServerApi } from "@/lib/api/api"
import { limitFromQuery, scopeFromQuery } from "@/lib/api/list-scope"
import { toInternal } from "@/lib/api/messages"
import { Search } from "@/lib/mail/search"

const toSearchError = (error: SearchError): InvalidRequestError | InternalError => {
  if (error._tag === "ConfigInvalid") {
    return new InvalidRequestError({
      message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
    })
  }
  if (error._tag === "ConfigUnreadable") {
    return new InvalidRequestError({ message: error.message })
  }
  return toInternal(error)
}

const SearchHandlers = HttpApiBuilder.group(ServerApi, "search", (handlers) =>
  handlers
    .handle("search.messages", ({ query }) =>
      Effect.gen(function* searchMessages() {
        const scope = yield* scopeFromQuery(query)
        const limit = yield* limitFromQuery(query)
        return yield* Search.pipe(
          Effect.flatMap((search) => search.messages({ query: query.query, scope }, limit)),
          Effect.mapError(toSearchError),
        )
      }),
    )
    .handle("search.marks", ({ query }) =>
      Effect.gen(function* searchMarks() {
        const scope = yield* scopeFromQuery(query)
        return yield* Search.pipe(
          Effect.flatMap((search) => search.marks({ query: query.query, scope })),
          Effect.mapError(toSearchError),
        )
      }),
    )
    .handle("search.start", ({ payload }) =>
      Effect.gen(function* startSearch() {
        const scope = yield* scopeFromQuery(payload)
        return yield* Search.pipe(
          Effect.flatMap((search) => search.start({ query: payload.query, scope })),
          Effect.mapError(toSearchError),
        )
      }),
    ),
)

export { SearchHandlers }
