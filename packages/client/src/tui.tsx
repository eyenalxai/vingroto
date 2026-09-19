import type { CliRenderer, TerminalColors, ThemeMode } from "@opentui/core"

import { createCliRenderer } from "@opentui/core"
import { render } from "@opentui/solid"
import { describeError } from "@vingroto/core/errors"
import { Effect } from "effect"
import * as Schema from "effect/Schema"

import type { AppRuntime } from "@/lib/runtime"

import { App } from "@/components/app"
import { RuntimeProvider } from "@/components/runtime-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { createClientRuntime } from "@/lib/runtime"
import { themeModeOf } from "@/lib/theme"

class StartupError extends Schema.TaggedError<StartupError>()("StartupError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

const themeQueryTimeoutMs = 1000

const readInitialPalette = (renderer: CliRenderer, runtime: AppRuntime) =>
  Effect.tryPromise({
    try: async () => renderer.getPalette({ size: 16, timeout: themeQueryTimeoutMs }),
    catch: (cause) => new StartupError({ message: "could not read the terminal palette", cause }),
  }).pipe(
    Effect.tapError((error) =>
      Effect.sync(() => {
        runtime.runFork(
          Effect.logWarning("could not read the terminal palette at startup").pipe(
            Effect.annotateLogs({ reason: describeError(error.cause) }),
          ),
        )
      }),
    ),
    Effect.orElseSucceed(() => null),
  )

const readInitialThemeMode = (renderer: CliRenderer) =>
  Effect.tryPromise({
    try: async () => renderer.waitForThemeMode(themeQueryTimeoutMs),
    catch: (cause) =>
      new StartupError({ message: "could not detect the terminal theme mode", cause }),
  }).pipe(Effect.orElseSucceed(() => null))

const resolveInitialMode = (
  detectedMode: ThemeMode | null,
  palette: TerminalColors | null,
): ThemeMode => detectedMode ?? (palette === null ? null : themeModeOf(palette)) ?? "dark"

const program = Effect.gen(function* main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write("vingroto needs an interactive terminal on stdin and stdout\n")
    return yield* new StartupError({ message: "stdin and stdout must be an interactive terminal" })
  }
  const runtime = yield* Effect.acquireRelease(
    Effect.sync(() => createClientRuntime()),
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
  const [palette, detectedMode] = yield* Effect.all(
    [readInitialPalette(renderer, runtime), readInitialThemeMode(renderer)],
    { concurrency: "unbounded" },
  )
  const initialMode = resolveInitialMode(detectedMode, palette)
  yield* Effect.tryPromise({
    try: async () =>
      render(
        () => (
          <RuntimeProvider runtime={runtime}>
            <ThemeProvider initialColors={palette} initialMode={initialMode}>
              <App />
            </ThemeProvider>
          </RuntimeProvider>
        ),
        renderer,
      ),
    catch: (cause) => new StartupError({ message: "could not mount the interface", cause }),
  })
  return yield* Effect.callback((resume) => {
    renderer.once("destroy", () => {
      resume(Effect.void)
    })
  })
})

const runTui = Effect.scoped(program)

export { runTui }
