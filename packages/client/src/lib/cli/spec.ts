import { Argument } from "effect/unstable/cli"

const rootName = "vingroto"
const rootDescription = "Terminal mail client"
const completionsName = "completions"
const completionsDescription = "Print a shell completion script"
const shells = ["bash", "nushell", "zsh"] as const

type Shell = (typeof shells)[number]

const shellDescription = "Shell to print completions for"

const shellArgument = Argument.Literals("shell", shells).pipe(
  Argument.withDescription(shellDescription),
)

export {
  completionsDescription,
  completionsName,
  rootDescription,
  rootName,
  shellArgument,
  shellDescription,
  shells,
  type Shell,
}
