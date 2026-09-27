import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"

import type { CatalogOperation } from "@/lib/cli/catalog"

import {
  httpMethods,
  isHttpMethod,
  operationById,
  operations,
  placeholderFor,
  requestMethod,
  requiredParameters,
} from "@/lib/cli/catalog"

class UsageError extends Schema.TaggedError<UsageError>()("UsageError", {
  message: Schema.String,
}) {}

const joinWithAnd = (parts: readonly string[]): string => {
  const last = parts.at(-1)
  if (last === undefined || parts.length === 1) {
    return parts.join("")
  }
  return `${parts.slice(0, -1).join(", ")} and ${last}`
}

const editDistance = (left: string, right: string): number => {
  const previous: number[] = []
  for (let column = 0; column <= right.length; column += 1) {
    previous.push(column)
  }
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0] ?? 0
    previous[0] = row
    for (let column = 1; column <= right.length; column += 1) {
      const saved = previous[column] ?? 0
      const substituted = left[row - 1] === right[column - 1] ? diagonal : diagonal + 1
      previous[column] = Math.min(
        substituted,
        (previous[column] ?? 0) + 1,
        (previous[column - 1] ?? 0) + 1,
      )
      diagonal = saved
    }
  }
  return previous[right.length] ?? right.length
}

const suggestionsFor = (operation: string): readonly string[] => {
  const lowered = operation.toLowerCase()
  const scored: { readonly operationId: string; readonly distance: number }[] = []
  for (const entry of operations) {
    const candidate = entry.operationId.toLowerCase()
    const distance = editDistance(lowered, candidate)
    if (distance <= Math.max(2, Math.floor(candidate.length / 3))) {
      scored.push({ distance, operationId: entry.operationId })
    }
  }
  scored.sort((left, right) => left.distance - right.distance)
  return scored.slice(0, 3).map((entry) => entry.operationId)
}

const unknownOperation = (operation: string, path?: string): UsageError => {
  const suggestions = suggestionsFor(operation)
  if (suggestions.length > 0) {
    const hint = suggestions.map((operationId) => `"${operationId}"`).join(" or ")
    return new UsageError({
      message: `unknown operation "${operation}" — did you mean ${hint}?`,
    })
  }
  if (path !== undefined) {
    return new UsageError({
      message: `unknown operation "${operation}" — pass one of the HTTP methods first: ${httpMethods.join(", ")}`,
    })
  }
  if (operation.startsWith("/")) {
    return new UsageError({
      message: `unknown operation "${operation}" — pass an HTTP method first, e.g. vingroto api get ${operation}`,
    })
  }
  return new UsageError({
    message: `unknown operation "${operation}" — run vingroto api list to see every operation`,
  })
}

const invocationError = (
  operation: CatalogOperation,
  params: Record<string, string>,
  hasBody: boolean,
): UsageError | undefined => {
  const declared = new Set(operation.parameters.map((parameter) => parameter.name))
  for (const name of Object.keys(params)) {
    if (declared.has(name)) {
      continue
    }
    const valid = operation.parameters.map((parameter) => parameter.name)
    if (valid.length === 0) {
      return new UsageError({
        message: `unknown parameter "${name}" for ${operation.operationId} — it takes no parameters`,
      })
    }
    return new UsageError({
      message: `unknown parameter "${name}" for ${operation.operationId} — valid: ${valid.join(", ")}`,
    })
  }
  const missing = requiredParameters(operation).filter(
    (parameter) => params[parameter.name] === undefined,
  )
  const bodyMissing = operation.bodyRequired && !hasBody
  if (missing.length === 0 && !bodyMissing) {
    return undefined
  }
  const parts: string[] = []
  const hints: string[] = []
  for (const location of ["path", "query"] as const) {
    const group = missing.filter((parameter) => parameter.location === location)
    if (group.length === 0) {
      continue
    }
    const names = group.map((parameter) => `"${parameter.name}"`)
    parts.push(`${location} parameter${group.length === 1 ? "" : "s"} ${joinWithAnd(names)}`)
    for (const parameter of group) {
      hints.push(`--param ${parameter.name}=${placeholderFor(parameter)}`)
    }
  }
  if (bodyMissing) {
    parts.push("a request body")
    hints.push("--data '<json>'")
  }
  return new UsageError({
    message: `operation ${operation.operationId} requires ${joinWithAnd(parts)} — pass ${hints.join(" ")}`,
  })
}

const interpolate = Effect.fnUntraced(function* interpolate(
  path: string,
  params: Record<string, string>,
) {
  const separator = path.indexOf("?")
  let pathname = separator === -1 ? path : path.slice(0, separator)
  const query = new URLSearchParams(separator === -1 ? "" : path.slice(separator + 1))
  const used = new Set<string>()
  for (const [name, value] of Object.entries(params)) {
    const placeholder = `{${name}}`
    if (!pathname.includes(placeholder)) {
      continue
    }
    pathname = pathname.replaceAll(placeholder, encodeURIComponent(value))
    used.add(name)
  }
  const open = pathname.indexOf("{")
  if (open !== -1) {
    const close = pathname.indexOf("}", open)
    const name = close === -1 ? pathname.slice(open + 1) : pathname.slice(open + 1, close)
    return yield* new UsageError({ message: `missing path parameter: ${name}` })
  }
  for (const [name, value] of Object.entries(params)) {
    if (!used.has(name)) {
      query.append(name, value)
    }
  }
  const search = query.toString()
  return search.length === 0 ? pathname : `${pathname}?${search}`
})

const resolveTarget = Effect.fnUntraced(function* resolveTarget(
  operation: string,
  path: string | undefined,
  params: Record<string, string>,
  hasBody: boolean,
) {
  const method = operation.toLowerCase()
  if (isHttpMethod(method)) {
    if (path === undefined) {
      return yield* new UsageError({
        message: `${operation} requires a request path — e.g. vingroto api ${method} /api/status`,
      })
    }
    if (!path.startsWith("/")) {
      return yield* new UsageError({ message: `request paths must start with "/" — got "${path}"` })
    }
    return { method: requestMethod(method), path: yield* interpolate(path, params) }
  }
  const entry = operationById.get(operation)
  if (entry === undefined) {
    return yield* unknownOperation(operation, path)
  }
  if (path !== undefined) {
    return yield* new UsageError({
      message: `operation ${entry.operationId} does not take a request path`,
    })
  }
  const invalid = invocationError(entry, params, hasBody)
  if (invalid !== undefined) {
    return yield* invalid
  }
  return { method: entry.method, path: yield* interpolate(entry.path, params) }
})

const resolveBody = Effect.fnUntraced(function* resolveBody(data: string) {
  if (data === "-") {
    return yield* Effect.tryPromise({
      try: () => new Response(Bun.stdin).text(),
      catch: (cause) =>
        new UsageError({
          message: `could not read the request body from stdin: ${describeError(cause)}`,
        }),
    })
  }
  if (!data.startsWith("@")) {
    return data
  }
  const file = data.slice(1)
  const fs = yield* FileSystem.FileSystem
  return yield* fs.readFileString(file).pipe(
    Effect.mapError(
      (cause) =>
        new UsageError({
          message: `could not read the request body file "${file}": ${describeError(cause)}`,
        }),
    ),
  )
})

export { UsageError, resolveBody, resolveTarget, unknownOperation }
