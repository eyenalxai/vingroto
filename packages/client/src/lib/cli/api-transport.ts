import type { HttpClientResponse } from "effect/unstable/http"
import type { HttpMethod } from "effect/unstable/http/HttpMethod"

import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as HttpBody from "effect/unstable/http/HttpBody"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import { STATUS_CODES } from "node:http"
import { EOL } from "node:os"

interface ApiRequest {
  readonly method: HttpMethod
  readonly path: string
}

const ResponseMessage = Schema.Struct({ message: Schema.String })

class DaemonUnreachable extends Schema.TaggedError<DaemonUnreachable>()("DaemonUnreachable", {
  message: Schema.String,
}) {}

const errorLine = (code: number, message: string) =>
  Effect.sync(() => {
    process.stderr.write(`error: ${message}${EOL}`)
    process.exitCode = code
  })

const jsonOutput = Schema.fromJsonString(Schema.Unknown, { space: 2 })

const writeJson = (value: unknown) =>
  Effect.sync(() => {
    const encoded = Schema.encodeResult(jsonOutput)(value)
    if (Result.isFailure(encoded)) {
      throw new Error("could not serialize the response as JSON", { cause: encoded.failure })
    }
    process.stdout.write(`${encoded.success}${EOL}`)
  })

const responseMessage = (body: string) => {
  const result = Schema.decodeResult(Schema.fromJsonString(ResponseMessage))(body)
  return Result.isSuccess(result) ? result.success.message : undefined
}

const sendRequest = (
  url: string,
  request: ApiRequest,
  headers: Headers,
  body: string | undefined,
) =>
  HttpClient.execute(
    HttpClientRequest.make(request.method)(new URL(request.path, url), {
      headers,
      ...(body === undefined
        ? {}
        : { body: HttpBody.text(body, headers.get("content-type") ?? "application/json") }),
    }),
  ).pipe(
    Effect.mapError(
      (cause) =>
        new DaemonUnreachable({
          message: `could not reach the vingroto daemon at ${url}: ${describeError(cause)}`,
        }),
    ),
  )

const streamResponse = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.gen(function* streamResponseBody() {
    let last = ""
    yield* response.stream.pipe(
      Stream.decodeText(),
      Stream.runForEach((chunk) =>
        Effect.sync(() => {
          if (chunk.length === 0) {
            return
          }
          process.stdout.write(chunk)
          last = chunk
        }),
      ),
    )
    if (last.length > 0 && !last.endsWith(EOL)) {
      process.stdout.write(EOL)
    }
  }).pipe(
    Effect.mapError(
      (cause) =>
        new DaemonUnreachable({
          message: `could not read the response body: ${describeError(cause)}`,
        }),
    ),
  )

const reportFailure = Effect.fnUntraced(function* reportFailure(
  request: ApiRequest,
  response: HttpClientResponse.HttpClientResponse,
) {
  const text = yield* response.text.pipe(
    Effect.mapError(
      (cause) =>
        new DaemonUnreachable({
          message: `could not read the response body: ${describeError(cause)}`,
        }),
    ),
  )
  if (text.length > 0) {
    process.stdout.write(text.endsWith(EOL) ? text : `${text}${EOL}`)
  }
  const detail = responseMessage(text)
  // HttpClientResponse does not expose the reason phrase, so it comes from Node's standard table.
  const statusText = STATUS_CODES[response.status] ?? ""
  const status = `HTTP ${response.status}${statusText.length === 0 ? "" : ` ${statusText}`}`
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
