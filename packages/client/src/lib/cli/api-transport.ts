import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { EOL } from "node:os"

interface ApiRequest {
  readonly method: string
  readonly path: string
}

const newlineByte = 10

const ResponseMessage = Schema.Struct({ message: Schema.String })

class DaemonUnreachable extends Schema.TaggedError<DaemonUnreachable>()("DaemonUnreachable", {
  message: Schema.String,
}) {}

const errorLine = (code: number, message: string) =>
  Effect.sync(() => {
    process.stderr.write(`error: ${message}${EOL}`)
    process.exitCode = code
  })

const writeJson = (value: unknown) =>
  Effect.sync(() => {
    process.stdout.write(`${JSON.stringify(value, null, 2)}${EOL}`)
  })

const responseMessage = (body: string) => {
  const result = Schema.decodeUnknownResult(Schema.fromJsonString(ResponseMessage))(body)
  return Result.isSuccess(result) ? result.success.message : undefined
}

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

const sendRequest = (
  url: string,
  request: ApiRequest,
  headers: Headers,
  body: string | undefined,
) =>
  Effect.tryPromise({
    try: async () =>
      fetch(new URL(request.path, url), {
        body: body ?? null,
        headers,
        method: request.method,
      }),
    catch: (cause) =>
      new DaemonUnreachable({
        message: `could not reach the vingroto daemon at ${url}: ${describeError(cause)}`,
      }),
  })

const streamResponse = (response: Response) =>
  Effect.tryPromise({
    try: async () => streamBody(response),
    catch: (cause) =>
      new DaemonUnreachable({
        message: `could not read the response body: ${describeError(cause)}`,
      }),
  })

const reportFailure = Effect.fnUntraced(function* reportFailure(
  request: ApiRequest,
  response: Response,
) {
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
})

export {
  DaemonUnreachable,
  errorLine,
  reportFailure,
  sendRequest,
  streamResponse,
  writeJson,
  type ApiRequest,
}
