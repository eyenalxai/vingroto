const invisibleCharacters =
  /[\u00AD\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF]/gu

const combiningGraphemeJoiner = "\u034F"

const unicodeSpaces = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/gu

const namedEntities: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  bull: "•",
  copy: "©",
  deg: "°",
  emsp: " ",
  ensp: " ",
  euro: "€",
  gt: ">",
  hellip: "…",
  laquo: "«",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  middot: "·",
  nbsp: " ",
  ndash: "–",
  permil: "‰",
  pound: "£",
  quot: '"',
  raquo: "»",
  rdquo: "”",
  reg: "®",
  rsquo: "’",
  sect: "§",
  shy: "",
  thinsp: " ",
  times: "×",
  trade: "™",
  yen: "¥",
  zwnj: "",
  zwj: "",
}

const maximumCodePoint = 1_114_111

const codePointToString = (value: number): string => {
  if (!Number.isInteger(value) || value < 0 || value > maximumCodePoint) {
    return ""
  }
  return String.fromCodePoint(value)
}

const decodeHtmlEntities = (value: string): string =>
  value.replaceAll(/&(?:#[xX][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]+);/gu, (entity) => {
    const body = entity.slice(1, -1)
    const lower = body.toLowerCase()
    if (lower.startsWith("#x")) {
      return codePointToString(Number.parseInt(body.slice(2), 16))
    }
    if (lower.startsWith("#")) {
      return codePointToString(Math.trunc(Number(body.slice(1))))
    }
    return namedEntities[lower] ?? entity
  })

const removeInvisibleCharacters = (value: string): string =>
  value.replaceAll(invisibleCharacters, "").replaceAll(combiningGraphemeJoiner, "")

const cssSelectorStart = /^[\s@.#*:a-z0-9_,>+~[\]="'()-]+\{\s*$/iu

const cssDeclaration = /^[-a-z]+\s*:/iu

const singleLineCssRule = /^[\s@.#*:a-z0-9_,>+~[\]="'()-]+\{[^{}]*:\s*\S[^{}]*\}\s*$/iu

const countBraces = (line: string, brace: string): number => {
  let count = 0
  for (const character of line) {
    if (character === brace) {
      count += 1
    }
  }
  return count
}

const stripCssBlocks = (value: string): string => {
  const kept: string[] = []
  let block: string[] = []
  let depth = 0
  let hasDeclaration = false
  for (const line of value.split("\n")) {
    if (depth === 0) {
      if (singleLineCssRule.test(line)) {
        continue
      }
      if (cssSelectorStart.test(line)) {
        block = [line]
        depth = 1
        hasDeclaration = false
        continue
      }
      kept.push(line)
      continue
    }
    block.push(line)
    depth += countBraces(line, "{") - countBraces(line, "}")
    if (cssDeclaration.test(line.trim())) {
      hasDeclaration = true
    }
    if (depth <= 0) {
      if (!hasDeclaration) {
        kept.push(...block)
      }
      block = []
      depth = 0
    }
  }
  if (block.length > 0) {
    kept.push(...block)
  }
  return kept.join("\n")
}

export { decodeHtmlEntities, removeInvisibleCharacters, stripCssBlocks, unicodeSpaces }
