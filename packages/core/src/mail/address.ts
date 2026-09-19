import * as Schema from "effect/Schema"

const MailAddress = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  address: Schema.NonEmptyString,
})

type MailAddress = typeof MailAddress.Type

export { MailAddress }
