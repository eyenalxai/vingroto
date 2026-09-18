import type { KeyEvent } from "@opentui/core"

import { createSignal, onCleanup } from "solid-js"

type LeaderAction = "add-account" | "open-settings" | "sync"

interface LeaderBinding {
  readonly key: string
  readonly action: LeaderAction
  readonly description: string
}

interface LeaderKeyOptions {
  readonly onAction: (action: LeaderAction) => void
}

const leaderTimeoutMs = 2000

const leaderBindings: readonly LeaderBinding[] = [
  { key: "a", action: "add-account", description: "add account" },
  { key: "s", action: "open-settings", description: "settings" },
  { key: "r", action: "sync", description: "sync" },
]

const describeLeaderHint = () => {
  const parts = leaderBindings.map((binding) => `${binding.key} ${binding.description}`)
  return `ctrl+x · ${parts.join(" · ")}`
}

const findLeaderBinding = (key: string) => leaderBindings.find((binding) => binding.key === key)

const isUnmodified = (key: KeyEvent) => !key.ctrl && !key.meta && !key.option && key.super !== true

const useLeaderKey = (options: LeaderKeyOptions) => {
  const [active, setActive] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    setActive(false)
  }

  const arm = () => {
    if (timer !== null) {
      clearTimeout(timer)
    }
    setActive(true)
    timer = setTimeout(() => {
      timer = null
      setActive(false)
    }, leaderTimeoutMs)
  }

  const handle = (key: KeyEvent): boolean => {
    if (!active()) {
      if (key.ctrl && key.name === "x") {
        arm()
        return true
      }
      return false
    }
    clear()
    if (key.name === "escape") {
      return true
    }
    if (isUnmodified(key)) {
      const binding = findLeaderBinding(key.name)
      if (binding !== undefined) {
        options.onAction(binding.action)
      }
    }
    return true
  }

  onCleanup(clear)

  return { active, handle }
}

export {
  describeLeaderHint,
  useLeaderKey,
  type LeaderAction,
  type LeaderBinding,
  type LeaderKeyOptions,
}
