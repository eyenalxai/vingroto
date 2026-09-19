import { createSignal, onCleanup } from "solid-js"

const armDurationMs = 3000

const discardMessage = "unsaved changes · esc again to discard"

const useArmedDiscard = () => {
  const [armed, setArmed] = createSignal(false)
  let armTimer: ReturnType<typeof setTimeout> | null = null

  const disarm = () => {
    if (armTimer !== null) {
      clearTimeout(armTimer)
      armTimer = null
    }
    setArmed(false)
  }

  const arm = () => {
    disarm()
    setArmed(true)
    armTimer = setTimeout(() => {
      armTimer = null
      setArmed(false)
    }, armDurationMs)
  }

  onCleanup(disarm)

  return { arm, armed, disarm, discard: () => discardMessage }
}

export { useArmedDiscard }
