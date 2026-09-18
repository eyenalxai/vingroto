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

const htmlTags: ReadonlySet<string> = new Set(
  `a abbr acronym address area article aside audio b base basefont bdi bdo big blockquote body br button canvas
  caption center cite code col colgroup data datalist dd del details dfn dialog dir div dl dt em embed fieldset
  figcaption figure font footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img
  input ins kbd label legend li link main map mark marquee menu meta meter nav nobr noembed noframes noscript
  object ol optgroup option output p param picture pre progress q rp rt ruby s samp script search section select
  slot small source span strike strong style sub summary sup table tbody td template textarea tfoot th thead time
  title tr track tt u ul var video wbr`.split(/\s+/u),
)

const simpleSelector =
  /(?:\*|[a-z][a-z0-9-]*|\.[-_a-z0-9]+|#[_a-z0-9-]+|::?[a-z-]+(?:\([^()]*\))?|\[[^\]]*\])/giu

const selectorChunk = /\[[^\]]*\]|\([^()]*\)|"[^"]*"|'[^']*'|[^\s>+~,[\]()'"]+/gu

const selectorGap = /^[\s>+~,]*$/u

const atRule =
  /^@(?:-[a-z]+-)?(?:charset|container|document|font-face|import|keyframes|layer|media|namespace|page|property|scope|starting-style|supports|viewport)\b/iu

const cssDeclaration = /(?:^|;)\s*[-a-z][-a-z0-9]*\s*:\s*\S/iu

const splitSelector = (value: string): readonly string[] | null => {
  const groups: string[] = []
  let current = ""
  let cursor = 0
  for (const match of value.matchAll(selectorChunk)) {
    const start = match.index
    if (start === undefined || !selectorGap.test(value.slice(cursor, start))) {
      return null
    }
    if (start > cursor) {
      if (current.length > 0) {
        groups.push(current)
      }
      current = ""
    }
    current += match[0]
    cursor = start + match[0].length
  }
  if (!selectorGap.test(value.slice(cursor))) {
    return null
  }
  if (current.length > 0) {
    groups.push(current)
  }
  return groups
}

const isSelectorGroup = (group: string): boolean => {
  let cursor = 0
  for (const match of group.matchAll(simpleSelector)) {
    const start = match.index
    if (start !== cursor) {
      return false
    }
    const token = match[0]
    if (/^[a-z]/iu.test(token) && !htmlTags.has(token.toLowerCase())) {
      return false
    }
    cursor = start + token.length
  }
  return cursor === group.length
}

const isCssSelector = (candidate: string): boolean => {
  const trimmed = candidate.trim()
  if (trimmed.length === 0) {
    return false
  }
  if (trimmed.startsWith("@")) {
    return atRule.test(trimmed)
  }
  const groups = splitSelector(trimmed)
  return groups !== null && groups.length > 0 && groups.every((group) => isSelectorGroup(group))
}

const matchingBrace = (value: string, open: number): number => {
  let depth = 0
  let index = open
  for (const character of value.slice(open)) {
    if (character === "{") {
      depth += 1
    } else if (character === "}") {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
    index += 1
  }
  return -1
}

const containsCssDeclaration = (body: string): boolean => {
  let cursor = 0
  for (;;) {
    const open = body.indexOf("{", cursor)
    if (open === -1) {
      return cssDeclaration.test(body.slice(cursor))
    }
    if (cssDeclaration.test(body.slice(cursor, open))) {
      return true
    }
    const close = matchingBrace(body, open)
    if (close === -1) {
      return false
    }
    if (containsCssDeclaration(body.slice(open + 1, close))) {
      return true
    }
    cursor = close + 1
  }
}

interface ParsedCssBlock {
  readonly pendingLines: number
  readonly endLine: number
  readonly hasDeclarations: boolean
}

const openCssBlock = (
  lines: readonly string[],
  index: number,
  pending: readonly string[],
): ParsedCssBlock | null => {
  let cursor = index
  let head = ""
  let openingBrace = -1
  const selectorLines: string[] = []
  while (openingBrace === -1) {
    const line = lines[cursor]
    if (line === undefined) {
      return null
    }
    const brace = line.indexOf("{")
    if (brace === -1) {
      if (!isCssSelector(line)) {
        return null
      }
      selectorLines.push(line)
      cursor += 1
      continue
    }
    head = line.slice(0, brace)
    openingBrace = brace
  }
  let pendingLines = 0
  while (pendingLines < pending.length) {
    const candidate = pending[pending.length - 1 - pendingLines]
    if (candidate === undefined || !isCssSelector([candidate, ...selectorLines, head].join("\n"))) {
      break
    }
    pendingLines += 1
  }
  const selector = [...pending.slice(pending.length - pendingLines), ...selectorLines, head].join(
    "\n",
  )
  if (!isCssSelector(selector)) {
    return null
  }
  const rest = lines.slice(cursor).join("\n")
  const close = matchingBrace(rest, head.length)
  if (close === -1) {
    return null
  }
  return {
    pendingLines,
    endLine: cursor + rest.slice(0, close).split("\n").length,
    hasDeclarations: containsCssDeclaration(rest.slice(head.length + 1, close)),
  }
}

const stripCssBlocks = (value: string): string => {
  const lines = value.split("\n")
  const kept: string[] = []
  const pending: string[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line === undefined) {
      break
    }
    const block = line.includes("{") ? openCssBlock(lines, index, pending) : null
    if (block === null) {
      if (isCssSelector(line)) {
        pending.push(line)
      } else {
        kept.push(...pending, line)
        pending.length = 0
      }
      index += 1
      continue
    }
    kept.push(...pending.slice(0, pending.length - block.pendingLines))
    const selector = pending.slice(pending.length - block.pendingLines)
    pending.length = 0
    if (!block.hasDeclarations) {
      kept.push(...selector)
      for (let cursor = index; cursor < block.endLine; cursor += 1) {
        const blockLine = lines[cursor]
        if (blockLine !== undefined) {
          kept.push(blockLine)
        }
      }
    }
    index = block.endLine
  }
  kept.push(...pending)
  return kept.join("\n")
}

export { decodeHtmlEntities, removeInvisibleCharacters, stripCssBlocks, unicodeSpaces }
