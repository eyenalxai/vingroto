import { createSignal } from "solid-js"

interface SettingsExpansion {
  readonly isExpanded: (key: string) => boolean
  readonly toggle: (key: string) => void
}

const [expandedKeys, setExpandedKeys] = createSignal<ReadonlySet<string>>(new Set())

const expansion: SettingsExpansion = {
  isExpanded: (key) => expandedKeys().has(key),
  toggle: (key) => {
    setExpandedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  },
}

const useSettingsExpansion = (): SettingsExpansion => expansion

export { useSettingsExpansion, type SettingsExpansion }
