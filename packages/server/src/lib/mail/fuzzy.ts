interface FuzzyField {
  readonly text: string
  readonly weight: number
}

const letterOrNumber = /[\p{L}\p{N}]/u
const wordSeparator = /[^\p{L}\p{N}]+/u

const normalizeText = (value: string) =>
  value.normalize("NFKD").replaceAll(/\p{M}/gu, "").toLowerCase()

const wordsOf = (value: string) => value.split(wordSeparator).filter((word) => word.length > 0)

const isBoundary = (value: string) => value === "" || !letterOrNumber.test(value)

const substringScore = (text: string, term: string): number | undefined => {
  const index = text.indexOf(term)
  if (index === -1) {
    return undefined
  }
  const boundary = isBoundary(index === 0 ? "" : (text[index - 1] ?? ""))
  return (boundary ? 65 : 50) + Math.max(0, 10 - index)
}

const subsequenceScore = (text: string, term: string): number | undefined => {
  let cursor = 0
  let previous = -1
  let run = 0
  let first = -1
  let score = 0
  for (const character of term) {
    let found = -1
    for (let index = cursor; index < text.length; index += 1) {
      if (text[index] === character) {
        found = index
        break
      }
    }
    if (found === -1) {
      return undefined
    }
    run = found === previous + 1 ? run + 1 : 0
    const boundary = isBoundary(found === 0 ? "" : (text[found - 1] ?? ""))
    score += 5 + Math.min(run, 4) * 4 + (boundary ? 5 : 0)
    if (first === -1) {
      first = found
    }
    previous = found
    cursor = found + 1
  }
  return score - Math.min(first, 8)
}

const editDistance = (left: string, right: string, maximum: number): number | undefined => {
  if (Math.abs(left.length - right.length) > maximum) {
    return undefined
  }
  const beforePrevious: number[] = []
  let previous: number[] = []
  for (let column = 0; column <= right.length; column += 1) {
    previous.push(column)
  }
  for (let row = 1; row <= left.length; row += 1) {
    const current: number[] = [row]
    for (let column = 1; column <= right.length; column += 1) {
      const substitution =
        (previous[column - 1] ?? 0) + (left[row - 1] === right[column - 1] ? 0 : 1)
      const insertion = (current[column - 1] ?? 0) + 1
      const deletion = (previous[column] ?? 0) + 1
      let value = Math.min(substitution, insertion, deletion)
      const transposed =
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      if (transposed) {
        value = Math.min(value, (beforePrevious[column - 2] ?? 0) + 1)
      }
      current.push(value)
    }
    beforePrevious.length = 0
    beforePrevious.push(...previous)
    previous = current
  }
  const distance = previous[right.length] ?? maximum + 1
  return distance <= maximum ? distance : undefined
}

const typoScore = (words: readonly string[], term: string): number | undefined => {
  if (term.length < 4) {
    return undefined
  }
  const maximum = term.length >= 7 ? 2 : 1
  const first = term[0] ?? ""
  const last = term.at(-1) ?? ""
  let best: number | undefined = undefined
  for (const word of words) {
    if (Math.abs(word.length - term.length) > maximum) {
      continue
    }
    if (!word.startsWith(first) && !word.endsWith(last)) {
      continue
    }
    const distance = editDistance(word, term, maximum)
    if (distance === undefined || distance === 0) {
      continue
    }
    const score = 45 - distance * 10
    if (best === undefined || score > best) {
      best = score
    }
  }
  return best
}

const termScore = (text: string, words: readonly string[], term: string): number | undefined => {
  let best: number | undefined = undefined
  for (const score of [
    substringScore(text, term),
    subsequenceScore(text, term),
    typoScore(words, term),
  ]) {
    if (score === undefined) {
      continue
    }
    if (best === undefined || score > best) {
      best = score
    }
  }
  return best
}

const scoreTerms = (
  fields: readonly FuzzyField[],
  terms: readonly string[],
): number | undefined => {
  const normalized = fields
    .map((field) => {
      return { text: normalizeText(field.text), weight: field.weight }
    })
    .filter((field) => field.text.length > 0)
    .map((field) => {
      return { ...field, words: wordsOf(field.text) }
    })
  let total = 0
  for (const term of terms) {
    const normalizedTerm = normalizeText(term)
    if (normalizedTerm.length === 0) {
      continue
    }
    let best: number | undefined = undefined
    for (const field of normalized) {
      const score = termScore(field.text, field.words, normalizedTerm)
      if (score === undefined) {
        continue
      }
      const weighted = score * field.weight
      if (best === undefined || weighted > best) {
        best = weighted
      }
    }
    if (best === undefined) {
      return undefined
    }
    total += best
  }
  return total
}

export { scoreTerms, type FuzzyField }
