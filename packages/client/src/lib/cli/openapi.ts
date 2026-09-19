import * as Schema from "effect/Schema"

const httpMethods = ["delete", "get", "head", "options", "patch", "post", "put"] as const

const OpenApiDocumentSchema = Schema.Struct({
  paths: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Record(
        Schema.String,
        Schema.Struct({ operationId: Schema.optionalKey(Schema.String) }),
      ),
    ),
  ),
})

type OpenApiDocument = typeof OpenApiDocumentSchema.Type

export { httpMethods, OpenApiDocumentSchema, type OpenApiDocument }
