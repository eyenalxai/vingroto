import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import PostalMime from "postal-mime"

interface ParsedMessageSource {
  readonly text: string | null
  readonly html: string | null
  readonly attachments: number
}

class BodyParseError extends Schema.TaggedError<BodyParseError>()("BodyParseError", {
  message: Schema.String,
}) {}

const parseMessageSource = Effect.fn("Message.parseSource")(function* parseSource(
  source: Buffer,
): Effect.fn.Return<ParsedMessageSource, BodyParseError> {
  const parsed = yield* Effect.tryPromise({
    try: async () => PostalMime.parse(source),
    catch: (cause: unknown) => new BodyParseError({ message: describeError(cause) }),
  })
  return {
    text: parsed.text ?? null,
    html: parsed.html ?? null,
    attachments: parsed.attachments.length,
  }
})

export { BodyParseError, parseMessageSource, type ParsedMessageSource }
