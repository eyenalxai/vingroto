import { Api } from "@vingroto/core/protocol/api"

import { SchemaErrorMiddleware } from "@/lib/api/schema-error"

const ServerApi = Api.middleware(SchemaErrorMiddleware)

export { ServerApi }
