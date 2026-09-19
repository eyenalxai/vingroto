import { Api } from "@vingroto/core/protocol/api"
import { OpenApi } from "effect/unstable/httpapi"

const httpMethods = ["delete", "get", "head", "options", "patch", "post", "put"] as const

type HttpMethod = (typeof httpMethods)[number]

interface CatalogParameter {
  readonly name: string
  readonly location: "query" | "header" | "path" | "cookie"
  readonly required: boolean
  readonly choices: readonly string[]
  readonly default: string | undefined
}

interface CatalogOperation {
  readonly operationId: string
  readonly method: string
  readonly path: string
  readonly summary: string | undefined
  readonly description: string | undefined
  readonly parameters: readonly CatalogParameter[]
  readonly bodyRequired: boolean
  readonly fragment: OpenApi.OpenAPISpecOperation
}

const schemaChoices = (schema: object): readonly string[] => {
  const values = "enum" in schema ? schema.enum : undefined
  if (!Array.isArray(values)) {
    return []
  }
  const choices: string[] = []
  for (const value of values) {
    if (typeof value === "string") {
      choices.push(value)
    }
  }
  return choices
}

const schemaDefault = (schema: object): string | undefined => {
  if (!("default" in schema)) {
    return undefined
  }
  const value = schema.default
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : undefined
}

// Why: the built-in catalog must agree with the API the daemon serves, and the projection is the same document the daemon publishes at /openapi.json.
const buildCatalog = (): readonly CatalogOperation[] => {
  const document = OpenApi.fromApi(Api)
  const catalog: CatalogOperation[] = []
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of httpMethods) {
      const operation = pathItem[method]
      if (operation === undefined) {
        continue
      }
      catalog.push({
        bodyRequired: operation.requestBody?.required === true,
        description: operation.description,
        fragment: operation,
        method: method.toUpperCase(),
        operationId: operation.operationId,
        parameters: operation.parameters.map((parameter) => {
          return {
            choices: schemaChoices(parameter.schema),
            default: schemaDefault(parameter.schema),
            location: parameter.in,
            name: parameter.name,
            required: parameter.required,
          }
        }),
        path,
        summary: operation.summary,
      })
    }
  }
  return catalog.toSorted((left, right) => left.operationId.localeCompare(right.operationId))
}

const operations = buildCatalog()

const operationById = new Map(operations.map((operation) => [operation.operationId, operation]))

const operationIds = operations.map((operation) => operation.operationId)

const operationChoices = [...operationIds, ...httpMethods]

const paths = [...new Set(operations.map((operation) => operation.path))].toSorted()

const paramCompletions = (): readonly string[] => {
  const values = new Set<string>()
  for (const operation of operations) {
    for (const parameter of operation.parameters) {
      if (parameter.choices.length === 0) {
        values.add(`${parameter.name}=`)
        continue
      }
      for (const choice of parameter.choices) {
        values.add(`${parameter.name}=${choice}`)
      }
    }
  }
  return [...values].toSorted()
}

const isHttpMethod = (value: string): value is HttpMethod =>
  (httpMethods as readonly string[]).includes(value)

const requiredParameters = (operation: CatalogOperation): readonly CatalogParameter[] =>
  operation.parameters.filter((parameter) => parameter.required)

const placeholderFor = (parameter: CatalogParameter): string =>
  parameter.choices.length === 0 ? "<value>" : `<${parameter.choices.join("|")}>`

const usageOf = (operation: CatalogOperation): string => {
  const parts = [`vingroto api ${operation.operationId}`]
  for (const parameter of requiredParameters(operation)) {
    parts.push(`--param ${parameter.name}=${placeholderFor(parameter)}`)
  }
  for (const parameter of operation.parameters) {
    if (parameter.required || parameter.default === undefined) {
      continue
    }
    parts.push(`[--param ${parameter.name}=${parameter.default}]`)
  }
  if (operation.bodyRequired) {
    parts.push("--data '<json>'")
  }
  return parts.join(" ")
}

export {
  httpMethods,
  isHttpMethod,
  operationById,
  operationChoices,
  operationIds,
  operations,
  paramCompletions,
  paths,
  placeholderFor,
  requiredParameters,
  usageOf,
  type CatalogOperation,
  type CatalogParameter,
}
