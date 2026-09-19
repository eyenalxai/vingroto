import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { Argument, CliError, Command, Flag } from "effect/unstable/cli"
import { EOL } from "node:os"

import type { OpenApiDocument } from "@/lib/cli/openapi"

import { httpMethods, OpenApiDocumentSchema } from "@/lib/cli/openapi"
import { resolveDaemon } from "@/lib/daemon"

const methods = new Set<string>(httpMethods)

interface ApiRequest {
  readonly method: string
  readonly path: string
}

const userError = (message: string) =>
  new CliError.UserError({ cause: message, userMessage: message })

class DaemonUnreachable extends Schema.TaggedError<DaemonUnreachable>()("DaemonUnreachable", {
  message: Schema.String,
}) {}

const errorLine = (code: number, message: string) =>
  Effect.sync(() => {
    process.stderr.write(`error: ${message}${EOL}`)
    process.exitCode = code
  })

const ResponseMessage = Schema.Struct({ message: Schema.String })

const responseMessage = (body: string) => {
  const result = Schema.decodeUnknownResult(Schema.fromJsonString(ResponseMessage))(body)
  return Result.isSuccess(result) ? result.success.message : undefined
}

const newlineByte = 10

const streamBody = async (response: Response) => {
  if (response.body === null) {
    return
  }
  let last = -1
  for await (const value of response.body) {
    if (value.length === 0) {
      continue
    }
    process.stdout.write(value)
    last = value.at(-1) ?? last
  }
  if (last !== -1 && last !== newlineByte) {
    process.stdout.write(EOL)
  }
}

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
      new DaemonUnreachable({
        message: `could not reach the vingroto daemon at ${url}: ${describeError(cause)}`,
      }),
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

const apiArgumentDescriptions = {
  request: "OpenAPI operation ID, or an HTTP method followed by a path",
} as const

const apiFlagDescriptions = {
  param: "OpenAPI path or query parameter",
  data: "Request body",
  header: "Request header in name:value form",
  server: "Daemon base URL (defaults to VINGROTO_SERVER or the registration file)",
  token: "Daemon bearer token (defaults to VINGROTO_TOKEN or the token file)",
} as const

const apiCommand = Command.make(
  "api",
  {
    request: Argument.String("operation | method path").pipe(
      Argument.withDescription(apiArgumentDescriptions.request),
      Argument.variadic({ min: 1, max: 2 }),
    ),
    param: Flag.KeyValuePair("param").pipe(
      Flag.withDescription(apiFlagDescriptions.param),
      Flag.optional,
    ),
    data: Flag.String("data").pipe(
      Flag.withAlias("d"),
      Flag.withDescription(apiFlagDescriptions.data),
      Flag.optional,
    ),
    header: Flag.String("header").pipe(
      Flag.withAlias("H"),
      Flag.withDescription(apiFlagDescriptions.header),
      Flag.atMost(100),
    ),
    server: Flag.String("server").pipe(
      Flag.withDescription(apiFlagDescriptions.server),
      Flag.optional,
    ),
    token: Flag.String("token").pipe(
      Flag.withDescription(apiFlagDescriptions.token),
      Flag.optional,
    ),
  },
  (config) =>
    Effect.gen(function* run() {
      const daemon = yield* resolveDaemon({
        server: Option.getOrUndefined(config.server),
        token: Option.getOrUndefined(config.token),
      }).pipe(Effect.mapError((error) => new DaemonUnreachable({ message: error.message })))
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
          new DaemonUnreachable({
            message: `could not reach the vingroto daemon at ${daemon.url}: ${describeError(cause)}`,
          }),
      })
      if (!response.ok) {
        const text = yield* Effect.tryPromise({
          try: async () => response.text(),
          catch: (cause) =>
            new DaemonUnreachable({
              message: `could not read the response body: ${describeError(cause)}`,
            }),
        })
        if (text.length > 0) {
          process.stdout.write(text.endsWith(EOL) ? text : `${text}${EOL}`)
        }
        const detail = responseMessage(text)
        const status = `HTTP ${response.status}${response.statusText.length === 0 ? "" : ` ${response.statusText}`}`
        yield* errorLine(
          3,
          `${request.method} ${request.path} failed with ${status}${detail === undefined ? "" : `: ${detail}`}`,
        )
        return
      }
      yield* Effect.tryPromise({
        try: async () => streamBody(response),
        catch: (cause) =>
          new DaemonUnreachable({
            message: `could not read the response body: ${describeError(cause)}`,
          }),
      })
    }).pipe(Effect.catchTag("DaemonUnreachable", (error) => errorLine(2, error.message))),
).pipe(Command.withDescription("Make a request to the running vingroto daemon"))

export {
  apiArgumentDescriptions,
  apiCommand,
  apiFlagDescriptions,
  interpolate,
  rawRequest,
  resolveOperation,
}
