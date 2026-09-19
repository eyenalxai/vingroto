import { Api } from "@vingroto/core/protocol/api"
import { OpenApi } from "effect/unstable/httpapi"

import { httpMethods } from "@/lib/cli/openapi"

const operationIds = (document: OpenApi.OpenAPISpec): readonly string[] => {
  const ids = new Set<string>()
  for (const pathItem of Object.values(document.paths)) {
    for (const method of httpMethods) {
      const operation = pathItem[method]
      if (operation !== undefined) {
        ids.add(operation.operationId)
      }
    }
  }
  return [...ids].toSorted()
}

const completionChoices = (): readonly string[] => [
  ...operationIds(OpenApi.fromApi(Api)),
  ...httpMethods,
]

export { completionChoices }
