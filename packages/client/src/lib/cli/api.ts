import { AppPaths } from "@vingroto/core/app-paths"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import { Argument, Command, Flag } from "effect/unstable/cli"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"

import type { CatalogOperation } from "@/lib/cli/catalog"

import { UsageError, resolveBody, resolveTarget, unknownOperation } from "@/lib/cli/api-invocation"
import {
  DaemonUnreachable,
  errorLine,
  reportFailure,
  sendRequest,
  streamResponse,
  writeJson,
} from "@/lib/cli/api-transport"
import { operationById, operations, usageOf } from "@/lib/cli/catalog"
import { resolveDaemon } from "@/lib/daemon"

interface ListEntry {
  readonly operationId: string
  readonly method: string
  readonly path: string
  readonly summary: string | null
}

const listEntries = (): readonly ListEntry[] =>
  operations.map((operation) => {
    return {
      method: operation.method,
      operationId: operation.operationId,
      path: operation.path,
      summary: operation.summary ?? null,
    }
  })

const describeEntry = (operation: CatalogOperation) => {
  const { description, parameters, requestBody, responses, summary } = operation.fragment
  return {
    operationId: operation.operationId,
    method: operation.method,
    path: operation.path,
    usage: usageOf(operation),
    summary,
    description,
    parameters,
    requestBody,
    responses,
  }
}

const apiArgumentDescriptions = {
  describe: "OpenAPI operation ID to describe",
  operation: "OpenAPI operation ID, or an HTTP method followed by a request path",
  path: "Request path, when the first argument is an HTTP method",
} as const

const apiFlagDescriptions = {
  param: "Path or query parameter for an operation, as name=value",
  data: "Request body, @file to read a file, or - to read stdin",
  header: "Request header in name:value form",
  server: "Daemon base URL (defaults to VINGROTO_SERVER or the registration file)",
  token: "Daemon bearer token (defaults to VINGROTO_TOKEN or the token file)",
} as const

const apiSubcommandDescriptions = {
  describe: "Print one operation from the built-in API catalog as JSON",
  list: "List every operation in the built-in API catalog as JSON",
} as const

const listCommand = Command.make("list", {}, () => writeJson(listEntries())).pipe(
  Command.withDescription(apiSubcommandDescriptions.list),
)

const describeCommand = Command.make(
  "describe",
  {
    operation: Argument.String("operation").pipe(
      Argument.withDescription(apiArgumentDescriptions.describe),
    ),
  },
  ({ operation }) =>
    Effect.gen(function* describeOperation() {
      const entry = operationById.get(operation)
      if (entry === undefined) {
        yield* Effect.fail(unknownOperation(operation))
        return
      }
      yield* writeJson(describeEntry(entry))
    }).pipe(Effect.catchTag("UsageError", (error) => errorLine(1, error.message))),
).pipe(Command.withDescription(apiSubcommandDescriptions.describe))

const apiCommand = Command.make(
  "api",
  {
    operation: Argument.String("operation").pipe(
      Argument.withDescription(apiArgumentDescriptions.operation),
      Argument.optional,
    ),
    path: Argument.String("path").pipe(
      Argument.withDescription(apiArgumentDescriptions.path),
      Argument.optional,
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
      const operation = Option.getOrUndefined(config.operation)
      if (operation === undefined) {
        yield* writeJson(listEntries())
        return
      }
      const path = Option.getOrUndefined(config.path)
      const params = Option.getOrElse(config.param, () => {
        return {}
      })
      const data = Option.getOrUndefined(config.data)
      const request = yield* resolveTarget(operation, path, params, data !== undefined)
      const body = data === undefined ? undefined : yield* resolveBody(data)
      const paths = yield* AppPaths
      const fs = yield* FileSystem.FileSystem
      const daemon = yield* resolveDaemon(
        { fs, paths },
        {
          server: Option.getOrUndefined(config.server),
          token: Option.getOrUndefined(config.token),
        },
      ).pipe(Effect.mapError((error) => new DaemonUnreachable({ message: error.message })))
      const headers = new Headers({ authorization: `Bearer ${daemon.token}` })
      for (const header of config.header) {
        const separator = header.indexOf(":")
        if (separator < 1) {
          yield* Effect.fail(
            new UsageError({ message: `invalid header, expected name:value: ${header}` }),
          )
          return
        }
        headers.set(header.slice(0, separator).trim(), header.slice(separator + 1).trim())
      }
      if (body !== undefined && !headers.has("content-type")) {
        headers.set("content-type", "application/json")
      }
      const response = yield* sendRequest(daemon.url, request, headers, body)
      yield* HttpClientResponse.filterStatusOk(response).pipe(
        Effect.matchEffect({
          onFailure: () => reportFailure(request, response),
          onSuccess: (ready) => streamResponse(ready),
        }),
      )
    }).pipe(
      Effect.catchTag("UsageError", (error) => errorLine(1, error.message)),
      Effect.catchTag("DaemonUnreachable", (error) => errorLine(2, error.message)),
    ),
).pipe(
  Command.withDescription("Make a request to the running vingroto daemon"),
  Command.withSubcommands([describeCommand, listCommand]),
)

export { apiArgumentDescriptions, apiCommand, apiFlagDescriptions, apiSubcommandDescriptions }
