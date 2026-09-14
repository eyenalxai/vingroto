import * as Schema from "effect/Schema"

class MailAddress extends Schema.Class<MailAddress>("MailAddress")({
  name: Schema.optional(Schema.String),
  address: Schema.String,
}) {}

export { MailAddress }
