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

const reconcileRows = <T extends object>(
  previous: readonly T[],
  next: readonly T[],
  keyOf: (row: T) => string | number,
): readonly T[] => {
  const byKey = new Map(previous.map((row) => [keyOf(row), row]))
  let identical = previous.length === next.length
  const reconciled = next.map((row, index) => {
    const candidate = byKey.get(keyOf(row))
    const reused = candidate !== undefined && shallowEqualRow(candidate, row) ? candidate : row
    if (reused !== previous[index]) {
      identical = false
    }
    return reused
  })
  return identical ? previous : reconciled
}

export { reconcileRows }
