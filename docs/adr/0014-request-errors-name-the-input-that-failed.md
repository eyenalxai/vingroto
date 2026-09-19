# Request errors name the input that failed

Status: accepted

Every request-schema rejection crosses the wire as an `InvalidRequestError` whose `message` is one actionable sentence and whose `field` is the location of the first problem. The Effect `SchemaIssue` tree is formatted inside the daemon; clients never see it.

- The message names the request part, the field and the reason: `missing required query parameter "scope" (one of: all, unread, mailbox)`, `query parameter "limit" must be a number`, `request body field "items[0].id" must be a string`, `unexpected request body field "extra"`.
- `field` is the machine-readable location, prefixed by the request part: `query.scope`, `path.messageId`, `body.items[0].id`.
- The formatter walks `Composite` and `Pointer` issues, resolves each pointer through the schema AST so a missing key can still report its allowed literals, maps encoding, type and filter issues to a type phrase or to the schema's own message, and expands a non-literal `AnyOf` into its children. The JSON payload codec wraps the body schema in a union, so treating the union as opaque would hide every body error behind "request body is invalid".
- Up to three problems are joined with `; ` and the rest collapse into ` (and N more)`. The raw Effect tree stays out of the response; the daemon logs it, truncated, together with the formatted message for diagnosis.
- A method or path that matches no route answers `{"_tag":"NotFoundError","message":"no route for POST /api/messages"}` with status 404, so a wrong path is as readable as a wrong parameter.

## Considered options

- **Returning the raw `SchemaError` message.** Rejected: it is a multi-line Effect tree that talks about missing keys and AST paths, names no request part, and leaks the schema's shape.
- **Returning a structured array of issues.** Rejected: every client would have to render the same sentences, and `field` already gives scripts the machine-readable location.
- **Formatting in each client.** Rejected: the TUI, the `api` command and any script would each need their own walker, and they would drift from the schemas the daemon actually decodes.
- **An empty 404 body.** Rejected: the old behavior made unknown routes indistinguishable from a broken server; the JSON envelope of every other failure costs nothing.
