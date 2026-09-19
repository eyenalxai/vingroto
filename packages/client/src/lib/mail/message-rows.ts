import type { MessageListItem } from "@vingroto/core/protocol/mail"

const shallowEqualRow = <T extends object>(left: T, right: T): boolean => {
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) {
    return false
  }
  for (const key in left) {
    if (left[key] !== right[key]) {
      return false
    }
  }
  return true
}

const reconcileMessageRows = (
  previous: readonly MessageListItem[],
  next: readonly MessageListItem[],
): readonly MessageListItem[] => {
  const byId = new Map(previous.map((row) => [row.id, row]))
  let identical = previous.length === next.length
  const reconciled = next.map((row, index) => {
    const candidate = byId.get(row.id)
    const reused = candidate !== undefined && shallowEqualRow(candidate, row) ? candidate : row
    if (reused !== previous[index]) {
      identical = false
    }
    return reused
  })
  return identical ? previous : reconciled
}

export { reconcileMessageRows }
