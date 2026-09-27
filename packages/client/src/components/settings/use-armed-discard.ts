import { Effect, Fiber } from "effect"
import { createSignal, onCleanup } from "solid-js"

import type { AppRuntime, AppRuntimeError } from "@/lib/runtime"

const armDurationMs = 3000

const discardMessage = "unsaved changes · esc again to discard"

const useArmedDiscard = (runtime: AppRuntime) => {
  const [armed, setArmed] = createSignal(false)
  let armFiber: Fiber.Fiber<void, AppRuntimeError> | null = null

  const disarm = () => {
    if (armFiber !== null) {
      runtime.runFork(Fiber.interrupt(armFiber))
      armFiber = null
    }
    setArmed(false)
  }

  const arm = () => {
    disarm()
    setArmed(true)
    armFiber = runtime.runFork(
      Effect.sleep(armDurationMs).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            armFiber = null
            setArmed(false)
          }),
        ),
      ),
    )
  }

  onCleanup(disarm)

  return { arm, armed, disarm, discard: () => discardMessage }
}

export { useArmedDiscard }
