import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { describeError } from "@/lib/errors"

class ExternalOpenError extends Schema.TaggedError<ExternalOpenError>()("ExternalOpenError", {
  url: Schema.String,
  message: Schema.String,
}) {}

// Opening in the user's browser is fire-and-forget: the child is detached so it outlives the TUI.
const openerCommand = (): readonly string[] => {
  if (process.platform === "darwin") {
    return ["open"]
  }
  if (process.platform === "win32") {
    return ["cmd", "/c", "start", ""]
  }
  return ["xdg-open"]
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
  yield* Effect.try({
    try: () => {
      const child = Bun.spawn([...openerCommand(), value], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      })
      child.unref()
    },
    catch: (cause) => new ExternalOpenError({ url: value, message: describeError(cause) }),
  })
})

export { ExternalOpenError, openExternal }
