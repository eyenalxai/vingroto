import * as Schema from "effect/Schema"

const MailAddress = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  address: Schema.String,
})

interface MailAddress extends Schema.Schema.Type<typeof MailAddress> {}

export { MailAddress }
