import type { Completions } from "effect/unstable/cli"

import { apiArgumentDescriptions, apiCommand, apiFlagDescriptions } from "@/lib/cli/api"
import {
  completionsDescription,
  completionsName,
  rootDescription,
  rootName,
  shellDescription,
  shells,
} from "@/lib/cli/spec"

// Why: Effect CLI does not expose flag or argument metadata to consumers, so the completion surface mirrors the commands defined in api.ts and spec.ts.
const apiFlags: readonly Completions.FlagDescriptor[] = [
  { name: "param", aliases: [], description: apiFlagDescriptions.param, type: { _tag: "String" } },
  { name: "data", aliases: ["d"], description: apiFlagDescriptions.data, type: { _tag: "String" } },
  {
    name: "header",
    aliases: ["H"],
    description: apiFlagDescriptions.header,
    type: { _tag: "String" },
  },
  {
    name: "server",
    aliases: [],
    description: apiFlagDescriptions.server,
    type: { _tag: "String" },
  },
  { name: "token", aliases: [], description: apiFlagDescriptions.token, type: { _tag: "String" } },
]

const apiArguments = (choices: readonly string[]): readonly Completions.ArgumentDescriptor[] => [
  {
    name: "operation",
    description: apiArgumentDescriptions.request,
    required: true,
    variadic: true,
    type: { _tag: "Choice", values: choices },
  },
]

const apiDescriptor = (choices: readonly string[]): Completions.CommandDescriptor => {
  return {
    name: apiCommand.name,
    description: apiCommand.shortDescription ?? apiCommand.description,
    flags: apiFlags,
    arguments: apiArguments(choices),
    subcommands: [],
  }
}

const completionsDescriptor = (): Completions.CommandDescriptor => {
  return {
    name: completionsName,
    description: completionsDescription,
    flags: [],
    arguments: [
      {
        name: "shell",
        description: shellDescription,
        required: true,
        variadic: false,
        type: { _tag: "Choice", values: shells },
      },
    ],
    subcommands: [],
  }
}

const clientDescriptor = (choices: readonly string[]): Completions.CommandDescriptor => {
  return {
    name: rootName,
    description: rootDescription,
    flags: [],
    arguments: [],
    subcommands: [apiDescriptor(choices), completionsDescriptor()],
  }
}

export { clientDescriptor }
