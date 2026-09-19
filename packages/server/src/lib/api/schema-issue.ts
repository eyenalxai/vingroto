import type * as SchemaIssue from "effect/SchemaIssue"
import type { HttpApiError } from "effect/unstable/httpapi"

import * as Option from "effect/Option"
import * as SchemaAST from "effect/SchemaAST"

const issueLimit = 3

type RequestPart = HttpApiError.HttpApiSchemaError["kind"]

interface RequestPartLabel {
  readonly subject: string
  readonly base: string
  readonly prefix: string
}

const partLabels: Record<RequestPart, RequestPartLabel> = {
  Body: { base: "request body", prefix: "body", subject: "request body field" },
  Headers: { base: "request headers", prefix: "header", subject: "request header" },
  Params: { base: "path parameters", prefix: "path", subject: "path parameter" },
  Payload: { base: "request body", prefix: "body", subject: "request body field" },
  Query: { base: "query parameters", prefix: "query", subject: "query parameter" },
  ResponseHeaders: { base: "response headers", prefix: "response", subject: "response header" },
}

interface MissingProblem {
  readonly kind: "Missing"
  readonly path: readonly PropertyKey[]
  readonly allowed: readonly string[]
}

interface UnexpectedProblem {
  readonly kind: "Unexpected"
  readonly path: readonly PropertyKey[]
}

interface ReasonProblem {
  readonly kind: "Reason"
  readonly path: readonly PropertyKey[]
  readonly reason: string
}

interface MessageProblem {
  readonly kind: "Message"
  readonly path: readonly PropertyKey[]
  readonly message: string
}

type Problem = MissingProblem | UnexpectedProblem | ReasonProblem | MessageProblem

const formatPath = (path: readonly PropertyKey[]) => {
  let text = ""
  for (const segment of path) {
    if (typeof segment === "number") {
      text += `[${segment}]`
      continue
    }
    const name = String(segment)
    text = text.length === 0 ? name : `${text}.${name}`
  }
  return text
}

const typeReason = (ast: SchemaAST.AST) => {
  if (SchemaAST.isString(ast)) {
    return "must be a string"
  }
  if (SchemaAST.isNumber(ast)) {
    return "must be a number"
  }
  if (SchemaAST.isBoolean(ast)) {
    return "must be a boolean"
  }
  if (SchemaAST.isArrays(ast)) {
    return "must be an array"
  }
  if (SchemaAST.isObjects(ast)) {
    return "must be an object"
  }
  if (SchemaAST.isNull(ast)) {
    return "must be null"
  }
  return "is invalid"
}

const literalValues = (ast: SchemaAST.AST): readonly string[] => {
  if (SchemaAST.isLiteral(ast)) {
    return [String(ast.literal)]
  }
  if (!SchemaAST.isUnion(ast)) {
    return []
  }
  const values: string[] = []
  for (const member of ast.types) {
    if (!SchemaAST.isLiteral(member)) {
      return []
    }
    values.push(String(member.literal))
  }
  return values
}

const childAst = (ast: Option.Option<SchemaAST.AST>, segment: PropertyKey) =>
  Option.match(ast, {
    onNone: () => Option.none<SchemaAST.AST>(),
    onSome: (node: SchemaAST.AST) => {
      if (typeof segment === "string" && SchemaAST.isObjects(node)) {
        const signature = node.propertySignatures.find((candidate) => candidate.name === segment)
        return Option.fromUndefinedOr(signature?.type)
      }
      if (typeof segment === "number" && SchemaAST.isArrays(node)) {
        return Option.fromUndefinedOr(node.elements[0])
      }
      return Option.none<SchemaAST.AST>()
    },
  })

const problemFromLeaf = (
  issue: SchemaIssue.Issue,
  path: readonly PropertyKey[],
  ast: Option.Option<SchemaAST.AST>,
): Problem[] => {
  if (issue._tag === "MissingKey") {
    const allowed = Option.match(ast, {
      onNone: () => [],
      onSome: (node: SchemaAST.AST) => literalValues(node),
    })
    return [{ allowed, kind: "Missing", path }]
  }
  if (issue._tag === "UnexpectedKey") {
    return [{ kind: "Unexpected", path }]
  }
  if (issue._tag === "Encoding" || issue._tag === "InvalidType") {
    return [{ kind: "Reason", path, reason: typeReason(issue.ast) }]
  }
  if (issue._tag === "InvalidValue" || issue._tag === "Forbidden") {
    const message = issue.annotations?.message
    if (message === undefined) {
      return [{ kind: "Reason", path, reason: "is invalid" }]
    }
    return [{ kind: "Message", message, path }]
  }
  return [{ kind: "Reason", path, reason: "is invalid" }]
}

const collectProblems = (
  issue: SchemaIssue.Issue,
  path: readonly PropertyKey[],
  ast: Option.Option<SchemaAST.AST>,
): Problem[] => {
  if (issue._tag === "Composite") {
    const problems: Problem[] = []
    for (const child of issue.issues) {
      problems.push(...collectProblems(child, path, Option.fromUndefinedOr(issue.ast)))
    }
    return problems
  }
  if (issue._tag === "Pointer") {
    let next = ast
    for (const segment of issue.path) {
      next = childAst(next, segment)
    }
    return collectProblems(issue.issue, [...path, ...issue.path], next)
  }
  if (issue._tag === "Filter") {
    const message = issue.filter.annotations?.message
    if (message !== undefined) {
      return [{ kind: "Message", message, path }]
    }
    const expected = issue.filter.annotations?.expected
    if (expected !== undefined) {
      return [{ kind: "Reason", path, reason: `must be ${expected}` }]
    }
    return collectProblems(issue.issue, path, ast)
  }
  if (issue._tag === "AnyOf") {
    const allowed = literalValues(issue.ast)
    if (allowed.length > 0) {
      return [{ kind: "Reason", path, reason: `must be one of: ${allowed.join(", ")}` }]
    }
    const problems: Problem[] = []
    for (const child of issue.issues) {
      problems.push(...collectProblems(child, path, ast))
    }
    if (problems.length === 0) {
      return [{ kind: "Reason", path, reason: "is invalid" }]
    }
    return problems
  }
  return problemFromLeaf(issue, path, ast)
}

const describeProblem = (label: RequestPartLabel, problem: Problem) => {
  if (problem.kind === "Message") {
    return problem.message
  }
  const path = formatPath(problem.path)
  if (problem.kind === "Missing") {
    const stem =
      path.length === 0
        ? `missing required ${label.base}`
        : `missing required ${label.subject} "${path}"`
    if (problem.allowed.length === 0) {
      return stem
    }
    return `${stem} (one of: ${problem.allowed.join(", ")})`
  }
  if (problem.kind === "Unexpected") {
    return path.length === 0 ? `unexpected ${label.base}` : `unexpected ${label.subject} "${path}"`
  }
  return path.length === 0
    ? `${label.base} ${problem.reason}`
    : `${label.subject} "${path}" ${problem.reason}`
}

const describeRequestIssue = (part: RequestPart, issue: SchemaIssue.Issue) => {
  const label = partLabels[part]
  const problems = collectProblems(issue, [], Option.none())
  const shown = problems.slice(0, issueLimit)
  const extra = problems.length > issueLimit ? ` (and ${problems.length - issueLimit} more)` : ""
  const message = `${shown.map((problem) => describeProblem(label, problem)).join("; ")}${extra}`
  const first = problems[0]
  const firstPath = first === undefined ? "" : formatPath(first.path)
  const field = firstPath.length === 0 ? undefined : `${label.prefix}.${firstPath}`
  return { field, message }
}

export { describeRequestIssue }
