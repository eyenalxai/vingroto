import type { Completions } from "effect/unstable/cli"

import {
  apiArgumentDescriptions,
  apiCommand,
  apiFlagDescriptions,
  apiSubcommandDescriptions,
} from "@/lib/cli/api"
import { operationChoices, operationIds, paramCompletions, paths } from "@/lib/cli/catalog"
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
  {
    name: "param",
    aliases: [],
    description: apiFlagDescriptions.param,
    type: { _tag: "Choice", values: paramCompletions() },
  },
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

const apiArguments: readonly Completions.ArgumentDescriptor[] = [
  {
    name: "operation",
    description: apiArgumentDescriptions.operation,
    required: false,
    variadic: false,
    type: { _tag: "Choice", values: operationChoices },
  },
  {
    name: "path",
    description: apiArgumentDescriptions.path,
    required: false,
    variadic: false,
    type: { _tag: "Choice", values: paths },
  },
]

const describeDescriptor: Completions.CommandDescriptor = {
  name: "describe",
  description: apiSubcommandDescriptions.describe,
  flags: [],
  arguments: [
    {
      name: "operation",
      description: apiArgumentDescriptions.describe,
      required: true,
      variadic: false,
      type: { _tag: "Choice", values: operationIds },
    },
  ],
  subcommands: [],
}

const listDescriptor: Completions.CommandDescriptor = {
  name: "list",
  description: apiSubcommandDescriptions.list,
  flags: [],
  arguments: [],
  subcommands: [],
}

const apiDescriptor: Completions.CommandDescriptor = {
  name: apiCommand.name,
  description: apiCommand.shortDescription ?? apiCommand.description,
  flags: apiFlags,
  arguments: apiArguments,
  subcommands: [describeDescriptor, listDescriptor],
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

const clientDescriptor = (): Completions.CommandDescriptor => {
  return {
    name: rootName,
    description: rootDescription,
    flags: [],
    arguments: [],
    subcommands: [apiDescriptor, completionsDescriptor()],
  }
}

export { clientDescriptor }
