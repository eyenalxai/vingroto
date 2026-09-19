import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

type QueryDefaultValue = boolean | number | string

// Why: a query parameter is rendered from its string-encoded side, so the default must be annotated as the string a request would carry.
const withQueryDefault = <S extends Schema.Top & { readonly EncodingServices: never }>(
  schema: S,
  value: S["Type"] & QueryDefaultValue,
) => {
  const stringTree = Schema.toCodecStringTree(schema)
  const annotated = Schema.annotateEncoded<typeof stringTree>({ default: String(value) })(
    stringTree,
  )
  return Schema.withDecodingDefaultTypeKey<Schema.optionalKey<typeof annotated>>(
    Effect.succeed(value),
  )(Schema.optionalKey(annotated))
}

const withDefault = <S extends Schema.Top>(schema: S, value: S["Type"]) => {
  const annotated = Schema.annotate<S>({ default: value })(schema)
  return Schema.withDecodingDefaultTypeKey<typeof annotated>(Effect.succeed(value))(annotated)
}

export { withDefault, withQueryDefault }
