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

const parseMessageSource = (source: Buffer): Effect.Effect<ParsedMessageSource, BodyParseError> =>
  Effect.tryPromise({
    try: async () => {
      const parsed = await PostalMime.parse(source)
      return {
        text: parsed.text ?? null,
        html: parsed.html ?? null,
        attachments: parsed.attachments.length,
      }
    },
    catch: (cause) => new BodyParseError({ message: describeError(cause) }),
  })

export { BodyParseError, parseMessageSource, type ParsedMessageSource }
