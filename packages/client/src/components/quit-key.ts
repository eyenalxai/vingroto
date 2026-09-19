import type { CliRenderer, KeyEvent } from "@opentui/core"

import { copySelection, hasSelection } from "@/lib/selection"

interface QuitKeyOptions {
  readonly onStatus?: (message: string) => void
  readonly renderer: CliRenderer
}

const handleQuitKey = (options: QuitKeyOptions, key: KeyEvent): boolean => {
  if (!key.ctrl || key.name !== "c") {
    return false
  }
  if (hasSelection(options.renderer)) {
    const outcome = copySelection(options.renderer)
    if (outcome === "copied") {
      options.onStatus?.("selection copied to the clipboard")
    } else if (outcome === "unsupported") {
      options.onStatus?.("this terminal cannot write to the clipboard")
    }
    return true
  }
  options.renderer.destroy()
  return true
}

export { handleQuitKey, type QuitKeyOptions }
