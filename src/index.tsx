import { BunRuntime } from "@effect/platform-bun"
import { createCliRenderer } from "@opentui/core"
import { render } from "@opentui/solid"
import { Effect } from "effect"
import * as Schema from "effect/Schema"

import { App } from "@/components/app"
import { RuntimeProvider } from "@/components/runtime-provider"
import { createAppRuntime } from "@/lib/runtime"

class StartupError extends Schema.TaggedError<StartupError>()("StartupError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

const program = Effect.gen(function* main() {
  const runtime = yield* Effect.acquireRelease(
    Effect.sync(() => createAppRuntime()),
    (value) => Effect.promise(async () => value.dispose()),
  )
  const renderer = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => createCliRenderer({ exitOnCtrlC: false }),
      catch: (cause) =>
        new StartupError({ message: "could not start the terminal renderer", cause }),
    }),
    (value) =>
      Effect.sync(() => {
        if (!value.isDestroyed) {
          value.destroy()
        }
      }),
  )
  yield* Effect.tryPromise({
    try: async () =>
      render(
        () => (
          <RuntimeProvider runtime={runtime}>
            <App />
          </RuntimeProvider>
        ),
        renderer,
      ),
    catch: (cause) => new StartupError({ message: "could not mount the interface", cause }),
  })
  yield* Effect.callback((resume) => {
    renderer.once("destroy", () => {
      resume(Effect.void)
    })
  })
})

BunRuntime.runMain(Effect.scoped(program))
