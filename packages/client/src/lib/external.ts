import type { CliRenderer } from "@opentui/core"

import { describeError } from "@vingroto/core/errors"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import path from "node:path"

class ExternalOpenError extends Schema.TaggedError<ExternalOpenError>()("ExternalOpenError", {
  url: Schema.String,
  message: Schema.String,
}) {}

class ExternalEditorError extends Schema.TaggedError<ExternalEditorError>()("ExternalEditorError", {
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
    return yield* new ExternalOpenError({
      url: value,
      message: "refusing to open a non-http link",
    })
  }
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const opener = openerCommand()
  return yield* spawner
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

const readEditorVariable = (name: string) =>
  Config.option(Config.String(name)).pipe(
    Effect.mapError(
      (cause) =>
        new ExternalEditorError({ message: `could not read ${name}: ${describeError(cause)}` }),
    ),
  )

const editorCommand = (
  visual: string | undefined,
  editor: string | undefined,
): readonly string[] => {
  const value = (visual ?? editor ?? "").trim()
  const parts = value.split(/\s+/u).filter((part) => part.length > 0)
  return parts.length === 0 ? ["vi"] : parts
}

const resolveEditorCommand = Effect.gen(function* resolveEditorCommand() {
  const visual = yield* readEditorVariable("VISUAL")
  const editor = yield* readEditorVariable("EDITOR")
  return editorCommand(Option.getOrUndefined(visual), Option.getOrUndefined(editor))
})

const describeEditorCommand = (command: readonly string[]): string => {
  const [executable, ...args] = command
  return [path.basename(executable ?? "vi"), ...args].join(" ")
}

// Why: the label is cosmetic, so an unreadable environment falls back to the same default the editor itself uses.
const describeSystemEditor: Effect.Effect<string> = resolveEditorCommand.pipe(
  Effect.map((command) => describeEditorCommand(command)),
  Effect.orElseSucceed(() => describeEditorCommand(["vi"])),
)

const writeFile = (file: string, text: string) =>
  Effect.gen(function* writeTemporaryFile() {
    const fs = yield* FileSystem.FileSystem
    yield* fs.writeFileString(file, text).pipe(
      Effect.mapError(
        (cause) =>
          new ExternalEditorError({
            message: `could not write ${file}: ${describeError(cause)}`,
          }),
      ),
    )
  })

const startEditor = (command: readonly string[], file: string) =>
  Effect.gen(function* spawnEditor() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const executable = command[0] ?? "vi"
    const args = command.slice(1)
    return yield* spawner
      .spawn(
        ChildProcess.make(executable, [...args, file], {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        }),
      )
      .pipe(
        Effect.mapError(
          (cause) =>
            new ExternalEditorError({
              message: `could not start ${executable}: ${describeError(cause)}`,
            }),
        ),
      )
  })

const editTextExternally = Effect.fn("External.editText")(function* editTextExternally(
  renderer: CliRenderer,
  text: string,
) {
  const fs = yield* FileSystem.FileSystem
  const command = yield* resolveEditorCommand
  const edit = Effect.gen(function* runExternalEditor() {
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "vingroto-compose-" }).pipe(
      Effect.mapError(
        (cause) =>
          new ExternalEditorError({
            message: `could not create a temporary directory: ${describeError(cause)}`,
          }),
      ),
    )
    const file = path.join(directory, "body.txt")
    yield* writeFile(file, text)
    yield* Effect.sync(() => {
      renderer.suspend()
    })
    const handle = yield* startEditor(command, file)
    const exitCode = yield* handle.exitCode.pipe(
      Effect.mapError(
        (cause) =>
          new ExternalEditorError({ message: `the editor failed: ${describeError(cause)}` }),
      ),
    )
    if (exitCode !== 0) {
      return yield* new ExternalEditorError({
        message: `the editor exited with status ${exitCode}`,
      })
    }
    return yield* fs
      .readFileString(file)
      .pipe(
        Effect.mapError(
          (cause) =>
            new ExternalEditorError({ message: `could not read ${file}: ${describeError(cause)}` }),
        ),
      )
  }).pipe(
    Effect.scoped,
    Effect.ensuring(
      Effect.sync(() => {
        renderer.resume()
      }),
    ),
  )
  return yield* edit
})

export {
  describeSystemEditor,
  editTextExternally,
  ExternalEditorError,
  ExternalOpenError,
  openExternal,
}
