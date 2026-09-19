import * as Array from "effect/Array"

const escapeCode = 27
const bellCode = 7
const csiIntroducer = 91
const stringIntroducers = new Set([93, 80, 88, 94, 95])
const backslashCode = 92
const finalByteMin = 64
const finalByteMax = 126
const titleLimit = 80
const messageLimit = 240

const isControlCode = (code: number) => code <= 31 || (code >= 127 && code <= 159)

// Why: the payload can be written into a terminal escape sequence or a notification bus message, so text must never smuggle escapes or control characters into a parser.
const stripEscapes = (value: string): string => {
  const chars = Array.fromIterable(value)
  const codeAt = (index: number) => chars[index]?.codePointAt(0) ?? -1
  let result = ""
  let index = 0
  while (index < chars.length) {
    const code = codeAt(index)
    if (code !== escapeCode) {
      result += isControlCode(code) ? " " : (chars[index] ?? "")
      index += 1
      continue
    }
    result += " "
    index += 1
    const introducer = codeAt(index)
    if (introducer === csiIntroducer) {
      index += 1
      while (index < chars.length) {
        const finalCode = codeAt(index)
        index += 1
        if (finalCode >= finalByteMin && finalCode <= finalByteMax) {
          break
        }
      }
      continue
    }
    if (stringIntroducers.has(introducer)) {
      index += 1
      while (index < chars.length && codeAt(index) !== bellCode && codeAt(index) !== escapeCode) {
        index += 1
      }
      if (codeAt(index) === bellCode) {
        index += 1
      } else if (codeAt(index) === escapeCode && codeAt(index + 1) === backslashCode) {
        index += 2
      }
      continue
    }
    index += 1
  }
  return result
}

const sanitize = (value: string): string => stripEscapes(value).replaceAll(/\s+/gu, " ").trim()

interface NewMailNotificationInput {
  readonly mailboxName: string
  readonly accountLabel: string | undefined
  readonly fromName: string | null
  readonly fromAddress: string | null
  readonly subject: string | null
}

const formatNewMailNotification = (
  input: NewMailNotificationInput,
): { readonly title: string; readonly message: string } => {
  const label = sanitize(
    input.accountLabel === undefined
      ? input.mailboxName
      : `${input.mailboxName} · ${input.accountLabel}`,
  )
  const title = Array.fromIterable(label).slice(0, titleLimit).join("")
  const sender =
    sanitize(input.fromName ?? "") || sanitize(input.fromAddress ?? "") || "unknown sender"
  const subject = sanitize(input.subject ?? "") || "(no subject)"
  const message = Array.fromIterable(`${sender} — ${subject}`).slice(0, messageLimit).join("")
  return { message, title }
}

export { formatNewMailNotification, type NewMailNotificationInput }
