import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

class ExternalOpenError extends Schema.TaggedError<ExternalOpenError>()("ExternalOpenError", {
  url: Schema.String,
  message: Schema.String,
}) {}

// Opening in the user's browser is fire-and-forget: the child is detached so it outlives the TUI.
const openerCommand = (): { readonly command: string; readonly args: readonly string[] } => {
  if (process.platform === "darwin") {
    return { command: "open", args: [] }
  }
  if (process.platform === "win32") {
    return { command: "cmd", args: ["/c", "start", ""] }
  }
  return { command: "xdg-open", args: [] }
}

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

const openExternal = Effect.fn("External.open")(function* open(value: string) {
  if (!isHttpUrl(value)) {
    yield* new ExternalOpenError({
      url: value,
      message: "refusing to open a non-http link",
    })
    return
  }
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const opener = openerCommand()
  yield* spawner
    .spawn(
      ChildProcess.make(opener.command, [...opener.args, value], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      }),
    )
    .pipe(
      Effect.tap((handle) => handle.unref),
      Effect.scoped,
      Effect.mapError(
        (cause) => new ExternalOpenError({ url: value, message: describeError(cause) }),
      ),
    )
})

export { ExternalOpenError, openExternal }
