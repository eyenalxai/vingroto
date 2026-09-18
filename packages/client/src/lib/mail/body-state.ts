import * as Data from "effect/Data"

type BodyState = Data.TaggedEnum<{
  loading: Record<never, never>
  error: { readonly message: string }
  loaded: { readonly text: string | null; readonly html: string | null }
}>

const bodyState = Data.taggedEnum<BodyState>()

export { bodyState, type BodyState }
