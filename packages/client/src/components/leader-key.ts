import type { KeyEvent } from "@opentui/core"

import { Effect, Fiber } from "effect"
import { createSignal, onCleanup } from "solid-js"

import type { AppRuntime, AppRuntimeError } from "@/lib/runtime"

type LeaderAction = "add-account" | "open-settings" | "open-outbox" | "open-drafts" | "sync"

interface LeaderBinding {
  readonly key: string
  readonly action: LeaderAction
  readonly description: string
}

interface LeaderKeyOptions {
  readonly runtime: AppRuntime
  readonly onAction: (action: LeaderAction) => void
}

const leaderTimeoutMs = 2000

const leaderBindings: readonly LeaderBinding[] = [
  { key: "a", action: "add-account", description: "add account" },
  { key: "o", action: "open-outbox", description: "outbox" },
  { key: "d", action: "open-drafts", description: "drafts" },
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
  let timeoutFiber: Fiber.Fiber<void, AppRuntimeError> | null = null

  const clear = () => {
    if (timeoutFiber !== null) {
      options.runtime.runFork(Fiber.interrupt(timeoutFiber))
      timeoutFiber = null
    }
    setActive(false)
  }

  const arm = () => {
    if (timeoutFiber !== null) {
      options.runtime.runFork(Fiber.interrupt(timeoutFiber))
    }
    setActive(true)
    timeoutFiber = options.runtime.runFork(
      Effect.sleep(leaderTimeoutMs).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            timeoutFiber = null
            setActive(false)
          }),
        ),
      ),
    )
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
