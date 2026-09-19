import { createEffect, createMemo, createSignal } from "solid-js"

import type { SettingsGroup, SettingsSection } from "@/components/settings/settings-rows"

import { sectionItems } from "@/components/settings/settings-rows"

type SettingsPane = "sections" | "content"

interface SettingsSelectionOptions {
  readonly sections: () => readonly SettingsSection[]
}

const useSettingsSelection = (options: SettingsSelectionOptions) => {
  const [sectionKey, setSectionKey] = createSignal<string>()
  const [selectedKeys, setSelectedKeys] = createSignal<ReadonlyMap<string, string>>(new Map())
  const [focus, setFocus] = createSignal<SettingsPane>("sections")

  const section = createMemo(() => {
    const list = options.sections()
    const current = sectionKey()
    return list.find((entry) => entry.key === current) ?? list[0]
  })

  const items = createMemo(() => {
    const current = section()
    return current === undefined ? [] : sectionItems(current)
  })

  const selectedKey = createMemo(() => {
    const current = section()
    return current === undefined ? undefined : selectedKeys().get(current.key)
  })

  const selectedItem = createMemo(() => items().find((item) => item.key === selectedKey()))

  const setSelectedKey = (owner: string, key: string) => {
    setSelectedKeys((current) => new Map(current).set(owner, key))
  }

  createEffect(() => {
    const current = section()
    if (current !== undefined && current.key !== sectionKey()) {
      setSectionKey(current.key)
    }
  })

  createEffect(() => {
    const current = section()
    if (current === undefined) {
      return
    }
    const visible = items()
    const remembered = selectedKeys().get(current.key)
    if (remembered !== undefined && visible.some((item) => item.key === remembered)) {
      return
    }
    const first = visible[0]
    if (first !== undefined) {
      setSelectedKey(current.key, first.key)
    }
  })

  const moveSection = (delta: number) => {
    const list = options.sections()
    if (list.length === 0) {
      return
    }
    const index = list.findIndex((entry) => entry.key === section()?.key)
    const next = Math.min(Math.max((index === -1 ? 0 : index) + delta, 0), list.length - 1)
    const target = list[next]
    if (target !== undefined) {
      setSectionKey(target.key)
    }
  }

  const moveItem = (delta: number) => {
    const visible = items()
    if (visible.length === 0) {
      return
    }
    const index = visible.findIndex((item) => item.key === selectedKey())
    const next = Math.min(Math.max((index === -1 ? 0 : index) + delta, 0), visible.length - 1)
    const target = visible[next]
    const current = section()
    if (target !== undefined && current !== undefined) {
      setSelectedKey(current.key, target.key)
    }
  }

  const focusSections = () => {
    setFocus("sections")
  }

  const focusContent = () => {
    setFocus("content")
  }

  const selectSection = (key: string) => {
    setSectionKey(key)
  }

  const toggleGroup = (group: SettingsGroup) => {
    if (!group.expanded()) {
      group.toggle()
      return
    }
    group.toggle()
    const current = section()
    if (current === undefined) {
      return
    }
    const remembered = selectedKeys().get(current.key)
    if (
      remembered !== undefined &&
      !sectionItems(current).some((item) => item.key === remembered)
    ) {
      setSelectedKey(current.key, group.key)
    }
  }

  return {
    focus,
    focusContent,
    focusSections,
    items,
    moveItem,
    moveSection,
    section,
    sectionKey: () => section()?.key,
    selectItem: setSelectedKey,
    selectSection,
    selectedItem,
    selectedKey,
    toggleGroup,
  }
}

export { useSettingsSelection, type SettingsPane, type SettingsSelectionOptions }
