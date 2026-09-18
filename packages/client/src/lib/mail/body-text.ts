import type {
  DomNode,
  FormatCallback,
  FormatOptions,
  HtmlToTextOptions,
  SelectorDefinition,
} from "html-to-text"

import { Predicate } from "effect"
import { compile } from "html-to-text"

import {
  decodeHtmlEntities,
  removeInvisibleCharacters,
  stripCssBlocks,
  unicodeSpaces,
} from "@/lib/mail/body-normalize"

const normalizeText = (value: string): string =>
  stripCssBlocks(
    removeInvisibleCharacters(decodeHtmlEntities(value.replaceAll(/\r\n?/gu, "\n"))).replaceAll(
      unicodeSpaces,
      " ",
    ),
  )
    .replaceAll(/[^\S\n]+/gu, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .trim()

const hiddenStyleFragments = [
  "display:none",
  "display: none",
  "visibility:hidden",
  "visibility: hidden",
  "max-height:0",
  "max-height: 0",
]

const hiddenSelectors: readonly SelectorDefinition[] = [
  ...hiddenStyleFragments.map((fragment) => {
    return { selector: `[style*="${fragment}" i]`, format: "skip" }
  }),
  { selector: "[hidden]", format: "skip" },
  { selector: '[style$="opacity:0" i]', format: "skip" },
  { selector: '[style$="opacity: 0" i]', format: "skip" },
  { selector: '[style*="opacity:0;" i]', format: "skip" },
  { selector: '[style*="opacity: 0;" i]', format: "skip" },
  { selector: '[style*="opacity:0 !important" i]', format: "skip" },
  { selector: '[style*="opacity: 0 !important" i]', format: "skip" },
]

const compactSelectors: readonly SelectorDefinition[] = [
  { selector: "h1", options: { leadingLineBreaks: 1, trailingLineBreaks: 1, uppercase: false } },
  { selector: "h2", options: { leadingLineBreaks: 1, trailingLineBreaks: 1, uppercase: false } },
  { selector: "h3", options: { leadingLineBreaks: 1, trailingLineBreaks: 1, uppercase: false } },
  { selector: "h4", options: { leadingLineBreaks: 1, trailingLineBreaks: 1, uppercase: false } },
  { selector: "h5", options: { leadingLineBreaks: 1, trailingLineBreaks: 1, uppercase: false } },
  { selector: "h6", options: { leadingLineBreaks: 1, trailingLineBreaks: 1, uppercase: false } },
  { selector: "p", options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
  { selector: "blockquote", options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
  { selector: "ul", options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
  { selector: "ol", options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
  { selector: "table", options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
  { selector: "pre", options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
  { selector: "hr", options: { leadingLineBreaks: 1, trailingLineBreaks: 1, length: 12 } },
]

const attributeOf = (elem: DomNode, name: string): string | null => {
  const attributes: unknown = elem.attribs
  if (!Predicate.isObject(attributes)) {
    return null
  }
  const value = attributes[name]
  return Predicate.isString(value) ? value : null
}

const anchorHref = (elem: DomNode, options: FormatOptions): string | null => {
  const raw = attributeOf(elem, "href")
  if (options.ignoreHref === true || raw === null || raw.length === 0) {
    return null
  }
  if (options.noAnchorUrl !== false && raw.startsWith("#")) {
    return null
  }
  return raw.replace(/^mailto:/u, "")
}

const wrapInBrackets = (href: string, brackets: FormatOptions["linkBrackets"]): string => {
  if (brackets === false) {
    return href
  }
  const open = brackets?.[0] ?? "["
  const close = brackets?.[1] ?? "]"
  return `${open}${href}${close}`
}

const anchorFormatter: FormatCallback = (elem, walk, builder, formatOptions) => {
  const href = anchorHref(elem, formatOptions)
  if (href === null) {
    walk(elem.children, builder)
    return
  }
  let text = ""
  builder.pushWordTransform((word) => {
    text += word
    return word
  })
  walk(elem.children, builder)
  builder.popWordTransform()
  if (removeInvisibleCharacters(text).trim().length === 0) {
    return
  }
  if (formatOptions.hideLinkHrefIfSameAsText === true && href === text) {
    return
  }
  builder.addInline(` ${wrapInBrackets(href, formatOptions.linkBrackets)}`, {
    noWordTransform: true,
  })
}

const imageFile = /\.(?:apng|avif|gif|jpe?g|png|svg|webp)$/iu

const imageAltNoise =
  /\b(?:avatar|badge|banner|icon|illustration|image|logo|photo|picture|placeholder|screenshot|spacer|sprite|thumbnail|wordmark)\b/iu

const genericImageAlts: ReadonlySet<string> = new Set([
  "avatar",
  "banner",
  "bullet",
  "divider",
  "icon",
  "image",
  "img",
  "pixel",
  "spacer",
])

const isMeaningfulAlt = (alt: string): boolean => {
  if (alt.length < 2 || !/[\p{L}\p{N}]/u.test(alt)) {
    return false
  }
  if (/^https?:\/\//iu.test(alt) || imageFile.test(alt)) {
    return false
  }
  if (imageAltNoise.test(alt)) {
    return false
  }
  return !genericImageAlts.has(alt.toLowerCase())
}

const imageFormatter: FormatCallback = (elem, walk, builder) => {
  const alt = attributeOf(elem, "alt")
  if (alt === null) {
    return
  }
  const visible = removeInvisibleCharacters(alt).trim()
  if (isMeaningfulAlt(visible)) {
    builder.addInline(`${visible} `)
  }
  walk(elem.children, builder)
}

const htmlToTextOptions: HtmlToTextOptions = {
  wordwrap: false,
  selectors: [
    ...hiddenSelectors,
    { selector: "img", format: "mailImage" },
    { selector: "a", format: "mailAnchor", options: { hideLinkHrefIfSameAsText: true } },
    ...compactSelectors,
  ],
  formatters: {
    mailImage: imageFormatter,
    mailAnchor: anchorFormatter,
  },
}

const convertHtml = compile(htmlToTextOptions)

const convertMixedText = compile({ ...htmlToTextOptions, preserveNewlines: true })

const htmlToText = (html: string): string => normalizeText(convertHtml(html))

const mixedTextToText = (text: string): string => normalizeText(convertMixedText(text))

const htmlMarkers = ["<style", "<html", "<body", "<div", "<table", "<a ", "</"]

const looksLikeHtml = (value: string): boolean => {
  const lower = value.toLowerCase()
  return htmlMarkers.some((marker) => lower.includes(marker))
}

const emptyBodyMessage = "(this message has no readable text body)"

const renderBodyText = (text: string | null, html: string | null): string => {
  if (text !== null) {
    if (looksLikeHtml(text)) {
      const converted = mixedTextToText(text)
      if (converted.length > 0) {
        return converted
      }
    }
    const cleaned = normalizeText(text)
    if (cleaned.length > 0) {
      return cleaned
    }
  }
  if (html !== null) {
    const converted = htmlToText(html)
    if (converted.length > 0) {
      return converted
    }
  }
  return emptyBodyMessage
}

export { htmlToText, looksLikeHtml, normalizeText, renderBodyText }
