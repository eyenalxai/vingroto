import { Command } from "effect/unstable/cli"

import { rootDescription, rootName } from "@/lib/cli/spec"
import { runTui } from "@/tui"

const rootCommand = Command.make(rootName, {}, () => runTui).pipe(
  Command.withDescription(rootDescription),
)

export { rootCommand }
