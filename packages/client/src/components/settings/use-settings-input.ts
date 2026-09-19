import type { KeyEvent } from "@opentui/core"
import type { Setter } from "solid-js"

import { useKeyboard, useRenderer } from "@opentui/solid"
import { createMemo, createSignal } from "solid-js"

import type { SettingsRow } from "@/components/settings/settings-rows"

interface SettingsInputOptions {
  readonly rows: () => readonly SettingsRow[]
  readonly selectedKey: () => string | undefined
  readonly editingKey: () => string | undefined
  readonly setSelectedKey: Setter<string | undefined>
  readonly setEditingKey: Setter<string | undefined>
  readonly onClose: () => void
}

const cycleRow = (row: SettingsRow, delta: number) => {
  if (row.kind === "choice") {
    row.cycle(delta)
    return
  }
  if (row.kind === "toggle" || row.kind === "mailbox") {
    row.toggle()
  }
}

const isActivatable = (row: SettingsRow): boolean =>
  row.kind === "choice" || row.kind === "toggle" || row.kind === "mailbox" || row.kind === "action"

const hintFor = (row: SettingsRow | undefined, editing: boolean): string => {
  if (editing) {
    return "enter commit · esc cancel"
  }
  if (row === undefined) {
    return "esc close"
  }
  if (row.kind === "heading") {
    return "↑↓ move · shift+↑↓ reorder · ⏎ edit name · ctrl+s save · esc close"
  }
  if (row.kind === "action") {
    return "⏎ add account · esc close"
  }
  if (row.kind === "mailbox") {
    return "↑↓ move · ⏎ mute or unmute · esc close"
  }
  if (row.kind === "reading") {
    return "↑↓ move · esc close"
  }
  return "↑↓ move · ⏎ edit or toggle · ctrl+s save · esc close"
}

const useSettingsInput = (options: SettingsInputOptions) => {
  const renderer = useRenderer()
  const [editPrevious, setEditPrevious] = createSignal("")

  const selectedRow = createMemo(() =>
    options.rows().find((row) => row.key === options.selectedKey()),
  )
  const editingRow = createMemo(() =>
    options.rows().find((row) => row.key === options.editingKey()),
  )

  const moveSelection = (delta: number) => {
    const list = options.rows()
    const index = list.findIndex((row) => row.key === options.selectedKey())
    const next = Math.min(Math.max((index === -1 ? 0 : index) + delta, 0), list.length - 1)
    const target = list[next]
    if (target !== undefined) {
      options.setSelectedKey(target.key)
    }
  }

  const beginEdit = (row: SettingsRow) => {
    if (row.kind !== "text" && row.kind !== "secret") {
      return
    }
    setEditPrevious(row.value())
    options.setEditingKey(row.key)
  }

  const cancelEdit = () => {
    const row = editingRow()
    if (row?.kind === "text") {
      row.input(editPrevious())
    } else if (row?.kind === "secret") {
      row.restore(editPrevious())
    }
    options.setEditingKey(undefined)
  }

  const activateRow = (row: SettingsRow) => {
    if (row.kind === "text" || row.kind === "secret") {
      beginEdit(row)
      return
    }
    if (row.kind === "heading") {
      const target = options.rows().find((candidate) => candidate.key === row.editKey)
      if (target !== undefined) {
        options.setSelectedKey(target.key)
        beginEdit(target)
      }
      return
    }
    if (row.kind === "action") {
      row.run()
      return
    }
    cycleRow(row, 1)
  }

  const selectRow = (key: string) => {
    options.setEditingKey(undefined)
    options.setSelectedKey(key)
    const row = options.rows().find((candidate) => candidate.key === key)
    if (row !== undefined && isActivatable(row)) {
      activateRow(row)
    }
  }

  const handleEditingKey = (event: KeyEvent) => {
    if (event.name === "return") {
      event.preventDefault()
      options.setEditingKey(undefined)
      return
    }
    if (event.name === "escape") {
      event.preventDefault()
      cancelEdit()
      return
    }
    if (event.ctrl && event.name === "s") {
      event.preventDefault()
      options.setEditingKey(undefined)
      selectedRow()?.save?.()
      return
    }
    const row = editingRow()
    if (row?.kind === "secret" && row.applyKey(event)) {
      event.preventDefault()
    }
  }

  const handleMoveKey = (event: KeyEvent, row: SettingsRow | undefined): boolean => {
    if (event.name === "down" || event.name === "up") {
      event.preventDefault()
      const delta = event.name === "down" ? 1 : -1
      if (event.shift && row?.kind === "heading") {
        row.reorder(delta)
      } else {
        moveSelection(delta)
      }
      return true
    }
    if ((event.name === "j" || event.name === "k") && !event.ctrl) {
      event.preventDefault()
      moveSelection(event.name === "j" ? 1 : -1)
      return true
    }
    return false
  }

  const handleActivateKey = (event: KeyEvent, row: SettingsRow | undefined) => {
    if (event.name === "return") {
      event.preventDefault()
      if (row !== undefined) {
        activateRow(row)
      }
      return
    }
    if (event.name === "space") {
      event.preventDefault()
      if (row !== undefined) {
        cycleRow(row, 1)
      }
      return
    }
    if (event.name === "left" || (event.name === "h" && !event.ctrl)) {
      event.preventDefault()
      if (row !== undefined) {
        cycleRow(row, -1)
      }
      return
    }
    if (event.name === "right" || (event.name === "l" && !event.ctrl)) {
      event.preventDefault()
      if (row !== undefined) {
        cycleRow(row, 1)
      }
    }
  }

  useKeyboard((event) => {
    if (event.ctrl && event.name === "c") {
      event.preventDefault()
      renderer.destroy()
      return
    }
    if (options.editingKey() !== undefined) {
      handleEditingKey(event)
      return
    }
    const row = selectedRow()
    if (event.name === "escape") {
      event.preventDefault()
      options.onClose()
      return
    }
    if (event.ctrl && event.name === "s") {
      event.preventDefault()
      row?.save?.()
      return
    }
    if (handleMoveKey(event, row)) {
      return
    }
    handleActivateKey(event, row)
  })

  return {
    hint: () => hintFor(selectedRow(), options.editingKey() !== undefined),
    selectRow,
  }
}

export { useSettingsInput }
