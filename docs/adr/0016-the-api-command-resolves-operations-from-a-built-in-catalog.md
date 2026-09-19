# The api command resolves operations from a built-in catalog

Status: accepted

`vingroto api` no longer fetches `/openapi.json` from the daemon to resolve an operation id. The client imports `@vingroto/core`, projects the same `Api` definition the daemon serves with `OpenApi.fromApi`, and builds its catalog at startup: operation id, method, path, summary, parameters with their required flag and literal choices, and whether a request body is required.

- `vingroto api list` — and `vingroto api` with no arguments — prints `[{operationId, method, path, summary}]` as JSON. `vingroto api describe <operation>` prints the operation, its parameters, request body, responses and a ready-to-run `usage` line. Both work without a daemon.
- Before a request is sent, the invocation is checked against the catalog: the operation must exist (unknown ids get edit-distance suggestions), only declared `--param` names may be used, every required path or query parameter must be present, and an operation that requires a body must be given one. A violation prints one `error:` line naming the missing or unknown input with the flag that fixes it, and exits 1 without contacting the daemon:

  ```
  error: operation account.username requires path parameter "accountId" — pass --param accountId=<value>
  error: unknown parameter "limt" for message.list — valid: scope, accountId, mailboxId, limit
  error: operation message.setSeen requires a request body — pass --data '<json>'
  ```

- No value is validated. `--param scope=inbox` is still sent, and the daemon answers `query parameter "scope" must be one of: all, unread, mailbox` (ADR-0014). The client checks exactly what the catalog states as fact; the daemon remains the single validator of values.
- `--data @file` reads the body from a file and `--data -` from stdin.
- Raw `vingroto api get /api/status` mode stays free-form: no catalog lookup, no parameter checks, the same `{path}` interpolation as before, so an operation the catalog does not know is still reachable.
- The completion scripts are generated from the same catalog — operation ids, methods, paths, and `--param` values with enum expansions such as `scope=all` — so they cannot drift from what the command accepts.

## Considered options

- **Resolving against the live document.** Rejected: it coupled even `list` and `describe` to a running daemon, made completion generation depend on a fetch, and let the client accept operations its own build did not know.
- **A checked-in JSON catalog.** Rejected: it duplicates the API definition and drifts silently; the projection is one call over the core package the client already depends on.
- **Validating values too (enums, number shapes).** Rejected: it would rebuild the codecs as a second source of truth, reject inputs the daemon accepts, and still be wrong for filters the client cannot see. The daemon's messages already name the field and the expected shape.
