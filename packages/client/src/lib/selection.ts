import type { CliRenderer } from "@opentui/core"

type SelectionCopyOutcome = "empty" | "copied" | "unsupported"

const hasSelection = (renderer: CliRenderer) => renderer.getSelection() !== null

const clearSelection = (renderer: CliRenderer) => {
  if (renderer.getSelection() === null) {
    return false
  }
  renderer.clearSelection()
  return true
}

const copySelection = (renderer: CliRenderer): SelectionCopyOutcome => {
  const selection = renderer.getSelection()
  if (selection === null) {
    return "empty"
  }
  const text = selection.getSelectedText()
  renderer.clearSelection()
  if (text.length === 0) {
    return "empty"
  }
  return renderer.copyToClipboardOSC52(text) ? "copied" : "unsupported"
}

const isCollapsedSelection = (renderer: CliRenderer) => {
  const selection = renderer.getSelection()
  if (selection === null) {
    return false
  }
  return (
    selection.behavior === "cell" &&
    selection.anchor.x === selection.focus.x &&
    selection.anchor.y === selection.focus.y
  )
}

export {
  clearSelection,
  copySelection,
  hasSelection,
  isCollapsedSelection,
  type SelectionCopyOutcome,
}
