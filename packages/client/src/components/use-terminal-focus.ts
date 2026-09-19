import { useRenderer } from "@opentui/solid"
import { createSignal, onCleanup } from "solid-js"

type TerminalFocus = "unknown" | "focused" | "blurred"

const useTerminalFocus = (): (() => TerminalFocus) => {
  const renderer = useRenderer()
  const [focus, setFocus] = createSignal<TerminalFocus>("unknown")

  const onFocus = () => {
    setFocus("focused")
  }

  const onBlur = () => {
    setFocus("blurred")
  }

  renderer.on("focus", onFocus)
  renderer.on("blur", onBlur)
  onCleanup(() => {
    renderer.off("focus", onFocus)
    renderer.off("blur", onBlur)
  })

  return focus
}

export { useTerminalFocus, type TerminalFocus }
