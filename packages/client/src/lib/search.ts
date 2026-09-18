const queryTerms = (query: string) =>
  query
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter((term) => term.length > 0)

const matchesQuery = (haystack: string, query: string): boolean => {
  const terms = queryTerms(query)
  if (terms.length === 0) {
    return true
  }
  const normalized = haystack.toLowerCase()
  return terms.every((term) => normalized.includes(term))
}

export { matchesQuery, queryTerms }
