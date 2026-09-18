interface LinkSegment {
  readonly text: string
  readonly url: string | undefined
}

const linkPattern = /\bhttps?:\/\/[^\s<>"'`]+/giu

const maximumDisplayedUrlLength = 72

const trailingPunctuation = new Set([".", ",", ";", ":", "!", "?", "'", '"'])

const countCharacter = (value: string, character: string): number => {
  let count = 0
  for (const entry of value) {
    if (entry === character) {
      count += 1
    }
  }
  return count
}

const trimTrailingUrl = (value: string): { readonly url: string; readonly remainder: string } => {
  let url = value
  let remainder = ""
  while (url.length > 0) {
    const last = url.at(-1)
    if (last === undefined) {
      break
    }
    // Sentence punctuation and unbalanced brackets belong to the surrounding prose, not the link.
    if (
      trailingPunctuation.has(last) ||
      (last === ")" && countCharacter(url, ")") > countCharacter(url, "(")) ||
      (last === "]" && countCharacter(url, "]") > countCharacter(url, "["))
    ) {
      remainder = `${last}${remainder}`
      url = url.slice(0, -1)
      continue
    }
    break
  }
  return { url, remainder }
}

const truncateUrl = (url: string, maximum = maximumDisplayedUrlLength): string => {
  if (url.length <= maximum) {
    return url
  }
  const budget = maximum - 1
  const head = Math.ceil(budget * 0.6)
  return `${url.slice(0, head)}…${url.slice(url.length - (budget - head))}`
}

const splitLinks = (text: string): readonly LinkSegment[] => {
  const segments: LinkSegment[] = []
  let cursor = 0
  for (const match of text.matchAll(linkPattern)) {
    const index = match.index
    if (index === undefined) {
      continue
    }
    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), url: undefined })
    }
    const { url, remainder } = trimTrailingUrl(match[0])
    if (url.length > 0) {
      segments.push({ text: truncateUrl(url), url })
      if (remainder.length > 0) {
        segments.push({ text: remainder, url: undefined })
      }
    } else {
      segments.push({ text: match[0], url: undefined })
    }
    cursor = index + match[0].length
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), url: undefined })
  }
  return segments
}

export { splitLinks, type LinkSegment }
