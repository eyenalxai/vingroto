import type { KeyEvent } from "@opentui/core"

import { useKeyboard, useRenderer } from "@opentui/solid"

import type { SettingsLayout } from "@/components/settings/settings-layout"
import type { SettingsItem, SettingsSection } from "@/components/settings/settings-rows"

import {
  arrowDelta,
  contentHint,
  cycleRow,
  isActivatable,
} from "@/components/settings/settings-input-model"
import { useArmedDiscard } from "@/components/settings/use-armed-discard"
import { useSettingsEditing } from "@/components/settings/use-settings-editing"
import { useSettingsSelection } from "@/components/settings/use-settings-selection"

interface SettingsInputOptions {
  readonly sections: () => readonly SettingsSection[]
  readonly layout: () => SettingsLayout
  readonly dirty: () => boolean
  readonly onClose: () => void
}

const useSettingsInput = (options: SettingsInputOptions) => {
  const renderer = useRenderer()
  const selection = useSettingsSelection({ sections: options.sections })
  const discard = useArmedDiscard()
  const saveItem = () => {
    const item = selection.selectedItem()
    if (item === undefined) {
      return
    }
    if (item.kind === "group") {
      item.group.save?.()
      return
    }
    item.row.save?.()
  }
  const editing = useSettingsEditing({
    selectedItem: selection.selectedItem,
    onSave: saveItem,
  })

  const focusSections = () => {
    editing.clear()
    selection.focusSections()
  }

  const focusContent = () => {
    editing.clear()
    selection.focusContent()
  }

  const activateItem = (item: SettingsItem) => {
    if (item.kind === "group") {
      selection.toggleGroup(item.group)
      return
    }
    if (item.row.kind === "text" || item.row.kind === "secret") {
      editing.begin(item.row)
      return
    }
    if (item.row.kind === "action") {
      item.row.run()
      return
    }
    cycleRow(item.row, 1)
  }

  const selectSection = (key: string) => {
    selection.selectSection(key)
    discard.disarm()
    if (options.layout() === "single") {
      focusContent()
    }
  }

  const selectGroup = (key: string) => {
    const current = selection.section()
    if (current === undefined) {
      return
    }
    selection.selectItem(current.key, key)
    selection.focusContent()
    const group = current.groups.find((candidate) => candidate.key === key)
    if (group !== undefined) {
      selection.toggleGroup(group)
    }
  }

  const selectRow = (key: string) => {
    const current = selection.section()
    if (current === undefined) {
      return
    }
    selection.selectItem(current.key, key)
    editing.clear()
    selection.focusContent()
    const item = selection.items().find((candidate) => candidate.key === key)
    if (item?.kind === "row" && isActivatable(item.row)) {
      activateItem(item)
    }
  }

  const handleSectionsKey = (event: KeyEvent): boolean => {
    const delta = arrowDelta(event)
    if (delta !== undefined) {
      selection.moveSection(delta)
      return true
    }
    if (
      event.name === "return" ||
      event.name === "right" ||
      event.name === "tab" ||
      (event.name === "l" && !event.ctrl)
    ) {
      focusContent()
      return true
    }
    return false
  }

  const handleContentKey = (event: KeyEvent, item: SettingsItem): boolean => {
    const delta = arrowDelta(event)
    if (delta !== undefined) {
      if (event.shift && item.kind === "group" && item.group.reorder !== undefined) {
        item.group.reorder(delta)
        return true
      }
      selection.moveItem(delta)
      return true
    }
    if (event.name === "return") {
      activateItem(item)
      return true
    }
    if (event.name === "space") {
      if (item.kind === "group") {
        selection.toggleGroup(item.group)
        return true
      }
      cycleRow(item.row, 1)
      return true
    }
    if (event.name === "left" || (event.name === "h" && !event.ctrl)) {
      if (item.kind === "group") {
        if (!item.group.expanded()) {
          return false
        }
        selection.toggleGroup(item.group)
        return true
      }
      return cycleRow(item.row, -1)
    }
    if (event.name === "right" || (event.name === "l" && !event.ctrl)) {
      if (item.kind === "group") {
        if (!item.group.expanded()) {
          selection.toggleGroup(item.group)
        }
        return true
      }
      cycleRow(item.row, 1)
      return true
    }
    return false
  }

  useKeyboard((event) => {
    if (event.ctrl && event.name === "c") {
      event.preventDefault()
      renderer.destroy()
      return
    }
    if (editing.editingKey() !== undefined) {
      editing.handleKey(event)
      return
    }
    if (event.name === "escape") {
      event.preventDefault()
      if (selection.focus() === "content") {
        discard.disarm()
        focusSections()
        return
      }
      if (discard.armed()) {
        discard.disarm()
        options.onClose()
        return
      }
      if (options.dirty()) {
        discard.arm()
        return
      }
      options.onClose()
      return
    }
    discard.disarm()
    if (event.ctrl && event.name === "s") {
      event.preventDefault()
      saveItem()
      return
    }
    if (selection.focus() === "sections") {
      if (handleSectionsKey(event)) {
        event.preventDefault()
      }
      return
    }
    if (event.name === "tab") {
      event.preventDefault()
      focusSections()
      return
    }
    const item = selection.selectedItem()
    if (item !== undefined && handleContentKey(event, item)) {
      event.preventDefault()
      return
    }
    if (event.name === "left" || (event.name === "h" && !event.ctrl)) {
      event.preventDefault()
      focusSections()
    }
  })

  const hint = (): string => {
    if (editing.editingKey() !== undefined) {
      return "⏎ commit · esc cancel"
    }
    if (selection.focus() === "sections") {
      return options.layout() === "single"
        ? "↑↓ sections · ⏎ open · esc close · ctrl+c quit app"
        : "↑↓ sections · ⏎ content · esc close · ctrl+c quit app"
    }
    return contentHint(selection.selectedItem())
  }

  return {
    armed: discard.armed,
    discard: discard.discard,
    editKey: editing.editingKey,
    focus: selection.focus,
    hint,
    section: selection.section,
    sectionKey: selection.sectionKey,
    selectGroup,
    selectRow,
    selectSection,
    selectedKey: selection.selectedKey,
  }
}

export { useSettingsInput }
