import type { KeyEvent } from "@opentui/core"

import { createSignal } from "solid-js"

import type { SettingsItem, SettingsRow } from "@/components/settings/settings-rows"

interface SettingsEditingOptions {
  readonly selectedItem: () => SettingsItem | undefined
  readonly onSave: () => void
}

const useSettingsEditing = (options: SettingsEditingOptions) => {
  const [editingKey, setEditingKey] = createSignal<string>()
  const [previous, setPrevious] = createSignal("")

  const begin = (row: SettingsRow) => {
    if (row.kind !== "text" && row.kind !== "secret") {
      return
    }
    setPrevious(row.value())
    setEditingKey(row.key)
  }

  const clear = () => {
    setEditingKey(undefined)
  }

  const cancel = () => {
    const item = options.selectedItem()
    if (item?.kind !== "row") {
      clear()
      return
    }
    if (item.row.kind === "text") {
      item.row.input(previous())
    } else if (item.row.kind === "secret") {
      item.row.restore(previous())
    }
    clear()
  }

  const handleKey = (event: KeyEvent) => {
    if (event.name === "return") {
      event.preventDefault()
      clear()
      return
    }
    if (event.name === "escape") {
      event.preventDefault()
      cancel()
      return
    }
    if (event.ctrl && event.name === "s") {
      event.preventDefault()
      clear()
      options.onSave()
      return
    }
    const item = options.selectedItem()
    if (item?.kind === "row" && item.row.kind === "secret" && item.row.applyKey(event)) {
      event.preventDefault()
    }
  }

  return { begin, cancel, clear, editingKey, handleKey }
}

export { useSettingsEditing, type SettingsEditingOptions }
