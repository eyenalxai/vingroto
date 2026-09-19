import * as Effect from "effect/Effect"
import { Command } from "effect/unstable/cli"

import { scriptFor } from "@/lib/cli/completions/generate"
import { completionsDescription, completionsName, shellArgument } from "@/lib/cli/spec"

const completionsCommand = Command.make(completionsName, { shell: shellArgument }, ({ shell }) =>
  Effect.sync(() => {
    process.stdout.write(scriptFor(shell))
  }),
).pipe(Command.withDescription(completionsDescription))

export { completionsCommand }
