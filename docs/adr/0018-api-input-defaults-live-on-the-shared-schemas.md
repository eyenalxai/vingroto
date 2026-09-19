# API input defaults live on the shared schemas

Status: accepted

The daemon, the OpenAPI document it publishes and the client's catalog all read one declaration: the core request schemas carry their defaults, so applying a default, documenting it and offering it in the CLI cannot disagree.

- `scope` defaults to `all` and `limit` to `100` on `message.list` and `search.messages`; `scope` defaults to `all` on `search.marks` and in the `search.start` body; and `seen` defaults to `true` in the `message.setSeen` body.
- Defaults use Effect v4's `Schema.withDecodingDefaultTypeKey(Effect.succeed(value))`. The decoding default is what makes the daemon substitute the value when the request omits it and what keeps the key out of a body schema's JSON Schema `required` list.
- A query parameter additionally flows through `Schema.toCodecStringTree`, then `Schema.annotateEncoded({ default })`, then `Schema.optionalKey`. Query parameters are rendered from their string-encoded side, so the annotation has to land after the conversion — annotating the original schema first loses it — and it has to hold the wire form (`"100"`, not `100`). `optionalKey` is what marks the parameter `required: false`; `withDecodingDefaultTypeKey` alone still publishes `required: true`.
- The client catalog reads `default` from the projected parameter schema. Defaulted parameters are optional in `api describe`, and the `usage` line brackets them: `vingroto api message.list [--param scope=all] [--param limit=100]`. No default is restated in the client.
- Server handlers are unchanged except where decoding now types a query field as optional. `scopeFromQuery` and `limitFromQuery` still fail with `InvalidRequestError` if a value is absent, which cannot happen over HTTP because decoding runs first and the guards keep the handler types honest.
- `GET /api/messages` without parameters now answers with the default list instead of `missing required query parameter "scope"`, which supersedes that example in ADR-0014 and ADR-0015. The `query` parameter of `search.messages` remains required and still produces a missing-parameter error.

## Considered options

- **Declaring defaults in descriptions only.** Rejected: the OpenAPI document and the catalog would not carry them, the daemon would still reject an omitted parameter, and prose drifts from the codec.
- **Applying defaults in each consumer.** Rejected: the same literal would live in the daemon handler, the client catalog and an OpenAPI transform, and the three would eventually disagree.
- **Post-processing `/openapi.json` to add `default` and flip `required`.** Rejected: the document would stop being a projection of the schemas the daemon decodes, so `api describe` and third-party consumers would see a contract the daemon might not honor.
- **Filling defaults in the client before sending.** Rejected: raw HTTP requests and other clients would not get them; the daemon has to be the one that applies a default.
- **`Schema.optionalWith` (v3).** Rejected: this codebase is on Effect v4, where `withDecodingDefaultTypeKey` is the supported way to default a decoded value, and the v3 helper does not interact with the string-tree codec.
