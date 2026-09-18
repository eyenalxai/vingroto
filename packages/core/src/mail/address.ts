import * as Schema from "effect/Schema"

const MailAddressSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  address: Schema.String,
})

type MailAddress = typeof MailAddressSchema.Type

export { MailAddressSchema, type MailAddress }
