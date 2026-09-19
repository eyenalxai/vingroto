import * as Predicate from "effect/Predicate"

const describeError = (error: unknown) => {
  if (Predicate.isError(error) && error.message.length > 0) {
    return error.message
  }
  return String(error)
}

export { describeError }
