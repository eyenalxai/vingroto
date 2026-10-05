import type { KeyEvent } from "@opentui/core"

const isPrintable = (event: KeyEvent) => {
  if (event.ctrl || event.meta || event.option || event.super === true) {
    return false
  }
  if (event.sequence.length === 0) {
    return false
  }
  for (const character of event.sequence) {
    const code = character.codePointAt(0) ?? 0
    if (code < 32 || code === 127) {
      return false
    }
  }
  return true
}

const applySecretKey = (value: string, event: KeyEvent): string | undefined => {
  if (event.ctrl && event.name === "u") {
    return ""
  }
  if (event.ctrl && event.name === "w") {
    return value.replace(/\s*\S+\s*$/u, "")
  }
  if (event.name === "backspace" || event.name === "delete") {
    return value.slice(0, -1)
  }
  if (isPrintable(event)) {
    return value + event.sequence
  }
  return undefined
}

export { applySecretKey }
