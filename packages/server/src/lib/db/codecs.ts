import { MailAddress } from "@vingroto/core/mail/address"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const persistedAddressList = Schema.NullOr(Schema.Array(MailAddress))

const persistedReferenceList = Schema.NullOr(Schema.Array(Schema.String))

const persistedRequiredAddressList = Schema.Array(MailAddress)

const persistedRequiredReferenceList = Schema.Array(Schema.String)

const persistedOutboxState = Schema.Literals(["pending", "failed"])

const decodeStored = <S extends Schema.Constraint>(
  schema: S,
  value: unknown,
): Effect.Effect<S["Type"], never, S["DecodingServices"]> =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(
      (error) => new Error("a stored value did not match its persisted schema", { cause: error }),
    ),
    Effect.orDie,
  )

export {
  decodeStored,
  persistedAddressList,
  persistedOutboxState,
  persistedReferenceList,
  persistedRequiredAddressList,
  persistedRequiredReferenceList,
}
