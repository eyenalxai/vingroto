import type { CliRenderer, KeyEvent } from "@opentui/core"

import { clearSelection, hasSelection } from "@/lib/selection"

interface SelectionKeyOptions {
  readonly renderer: CliRenderer
}

const handleSelectionKey = (options: SelectionKeyOptions, key: KeyEvent): boolean => {
  if (hasSelection(options.renderer)) {
    if (key.name === "escape") {
      clearSelection(options.renderer)
      return true
    }
    clearSelection(options.renderer)
  }
  return false
}

interface SearchKeyOptions {
  readonly searchEditing: () => boolean
  readonly onSearchClear: () => void
  readonly onSearchCommit: () => void
  readonly onSearchType: (character: string) => void
  readonly onSearchBackspace: () => void
}

const handleSearchKey = (options: SearchKeyOptions, key: KeyEvent): boolean => {
  if (!options.searchEditing()) {
    return false
  }
  if (key.name === "escape") {
    options.onSearchClear()
    return true
  }
  if (key.name === "return") {
    options.onSearchCommit()
    return true
  }
  if (key.name === "backspace" || key.name === "delete") {
    options.onSearchBackspace()
    return true
  }
  if (key.name === "tab" || key.name === "left" || key.name === "right") {
    return true
  }
  if (key.name === "space") {
    options.onSearchType(" ")
    return true
  }
  if (!key.ctrl && !key.meta && !key.option && key.super !== true && key.name.length === 1) {
    options.onSearchType(key.name)
    return true
  }
  return false
}

export { handleSearchKey, handleSelectionKey, type SearchKeyOptions, type SelectionKeyOptions }
