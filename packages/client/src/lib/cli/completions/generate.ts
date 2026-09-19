import { Completions } from "effect/unstable/cli"

import type { Shell } from "@/lib/cli/spec"

import { clientDescriptor } from "@/lib/cli/completions/descriptor"
import { generateNushell } from "@/lib/cli/completions/nushell"
import { rootName } from "@/lib/cli/spec"

const completionFileNames: Record<Shell, string> = {
  bash: `${rootName}.bash`,
  nushell: `${rootName}.nu`,
  zsh: `_${rootName}`,
}

// Why: Effect's generated header still points at the --completions global flag, which this CLI removes in favour of the completions subcommand.
const fixInstallHint = (script: string, shell: "bash" | "zsh"): string =>
  script.replaceAll(`${rootName} --completions ${shell}`, `${rootName} completions ${shell}`)

const generators: Record<Shell, (descriptor: Completions.CommandDescriptor) => string> = {
  bash: (descriptor) => fixInstallHint(Completions.generate(rootName, "bash", descriptor), "bash"),
  nushell: (descriptor) => generateNushell(rootName, descriptor),
  zsh: (descriptor) => fixInstallHint(Completions.generate(rootName, "zsh", descriptor), "zsh"),
}

const scriptFor = (shell: Shell): string => generators[shell](clientDescriptor())

export { completionFileNames, scriptFor }
