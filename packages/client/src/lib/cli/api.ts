import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Argument, CliError, Command, Flag } from "effect/unstable/cli"
import { EOL } from "node:os"

import type { DaemonError } from "@/lib/daemon"

import { resolveDaemon } from "@/lib/daemon"

const methods = new Set(["delete", "get", "head", "options", "patch", "post", "put"])

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

interface ApiRequest {
  readonly method: string
  readonly path: string
}

const userError = (message: string) =>
  new CliError.UserError({ cause: message, userMessage: message })

const daemonUserError = (error: DaemonError) => userError(error.message)

const interpolate = Effect.fnUntraced(function* interpolate(
  path: string,
  params: Record<string, string>,
) {
  const separator = path.indexOf("?")
  let pathname = separator === -1 ? path : path.slice(0, separator)
  const query = new URLSearchParams(separator === -1 ? "" : path.slice(separator + 1))
  const used = new Set<string>()
  for (const [name, value] of Object.entries(params)) {
    const placeholder = `{${name}}`
    if (!pathname.includes(placeholder)) {
      continue
    }
    pathname = pathname.replaceAll(placeholder, encodeURIComponent(value))
    used.add(name)
  }
  const open = pathname.indexOf("{")
  if (open !== -1) {
    const close = pathname.indexOf("}", open)
    const name = close === -1 ? pathname.slice(open + 1) : pathname.slice(open + 1, close)
    return yield* Effect.fail(userError(`missing path parameter: ${name}`))
  }
  for (const [name, value] of Object.entries(params)) {
    if (!used.has(name)) {
      query.append(name, value)
    }
  }
  const search = query.toString()
  return search.length === 0 ? pathname : `${pathname}?${search}`
})

const resolveOperation = Effect.fnUntraced(function* resolveOperation(
  document: OpenApiDocument,
  operationId: string,
  params: Record<string, string>,
) {
  for (const [path, operations] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(operations)) {
      if (!methods.has(method) || operation.operationId !== operationId) {
        continue
      }
      return { method: method.toUpperCase(), path: yield* interpolate(path, params) }
    }
  }
  return yield* Effect.fail(userError(`operation not found: ${operationId}`))
})

const rawRequest = (input: readonly string[]): ApiRequest | undefined => {
  if (input.length !== 2) {
    return undefined
  }
  const [method, path] = input
  if (method === undefined || path === undefined) {
    return undefined
  }
  if (!methods.has(method.toLowerCase()) || !path.startsWith("/")) {
    return undefined
  }
  return { method: method.toUpperCase(), path }
}

const loadOpenApiDocument = Effect.fnUntraced(function* loadOpenApiDocument(
  url: string,
  headers: Headers,
) {
  const response = yield* Effect.tryPromise({
    try: async () => fetch(new URL("/openapi.json", url), { headers }),
    catch: (cause) =>
      userError(`could not reach the vingroto daemon at ${url}: ${describeError(cause)}`),
  })
  if (!response.ok) {
    return yield* Effect.fail(
      userError(`could not load the OpenAPI document: HTTP ${response.status}`),
    )
  }
  const raw = yield* Effect.tryPromise({
    try: async (): Promise<unknown> => response.json(),
    catch: (cause) => userError(`could not parse the OpenAPI document: ${describeError(cause)}`),
  })
  return yield* Schema.decodeUnknownEffect(OpenApiDocumentSchema)(raw).pipe(
    Effect.mapError((cause) =>
      userError(`could not parse the OpenAPI document: ${describeError(cause)}`),
    ),
  )
})

const resolveRequest = Effect.fnUntraced(function* resolveRequest(
  url: string,
  headers: Headers,
  input: readonly string[],
  params: Record<string, string>,
) {
  const raw = rawRequest(input)
  if (raw !== undefined) {
    return { method: raw.method, path: yield* interpolate(raw.path, params) }
  }
  const [operationId] = input
  if (operationId === undefined) {
    return yield* Effect.fail(userError("expected an operation ID or an HTTP method and a path"))
  }
  const document = yield* loadOpenApiDocument(url, headers)
  return yield* resolveOperation(document, operationId, params)
})

const apiCommand = Command.make(
  "api",
  {
    request: Argument.String("operation | method path").pipe(
      Argument.withDescription("OpenAPI operation ID, or an HTTP method followed by a path"),
      Argument.variadic({ min: 1, max: 2 }),
    ),
    param: Flag.KeyValuePair("param").pipe(
      Flag.withDescription("OpenAPI path or query parameter"),
      Flag.optional,
    ),
    data: Flag.String("data").pipe(
      Flag.withAlias("d"),
      Flag.withDescription("Request body"),
      Flag.optional,
    ),
    header: Flag.String("header").pipe(
      Flag.withAlias("H"),
      Flag.withDescription("Request header in name:value form"),
      Flag.atMost(100),
    ),
    server: Flag.String("server").pipe(
      Flag.withDescription(
        "Daemon base URL (defaults to VINGROTO_SERVER or the registration file)",
      ),
      Flag.optional,
    ),
    token: Flag.String("token").pipe(
      Flag.withDescription("Daemon bearer token (defaults to VINGROTO_TOKEN or the token file)"),
      Flag.optional,
    ),
  },
  (config) =>
    Effect.gen(function* run() {
      const daemon = yield* resolveDaemon({
        server: Option.getOrUndefined(config.server),
        token: Option.getOrUndefined(config.token),
      }).pipe(Effect.mapError(daemonUserError))
      const headers = new Headers({ authorization: `Bearer ${daemon.token}` })
      for (const header of config.header) {
        const separator = header.indexOf(":")
        if (separator < 1) {
          yield* Effect.fail(userError(`invalid header, expected name:value: ${header}`))
        }
        headers.set(header.slice(0, separator).trim(), header.slice(separator + 1).trim())
      }
      const body = Option.getOrUndefined(config.data)
      if (body !== undefined && !headers.has("content-type")) {
        headers.set("content-type", "application/json")
      }
      const params = Option.getOrElse(config.param, () => {
        return {}
      })
      const request = yield* resolveRequest(daemon.url, headers, config.request, params)
      const response = yield* Effect.tryPromise({
        try: async () =>
          fetch(new URL(request.path, daemon.url), {
            method: request.method,
            headers,
            body: body ?? null,
          }),
        catch: (cause) =>
          userError(
            `could not reach the vingroto daemon at ${daemon.url}: ${describeError(cause)}`,
          ),
      })
      const output = yield* Effect.tryPromise({
        try: async () => response.text(),
        catch: (cause) => userError(`could not read the response body: ${describeError(cause)}`),
      })
      const text = output.length === 0 || output.endsWith(EOL) ? output : `${output}${EOL}`
      process.stdout.write(text)
      if (!response.ok) {
        process.stderr.write(
          `HTTP ${response.status}${response.statusText.length === 0 ? "" : ` ${response.statusText}`}${EOL}`,
        )
        process.stderr.write(text)
        yield* Effect.fail(
          userError(`${request.method} ${request.path} returned HTTP ${response.status}`),
        )
      }
    }),
).pipe(Command.withDescription("Make a request to the running vingroto daemon"))

export { apiCommand, interpolate, rawRequest, resolveOperation }
