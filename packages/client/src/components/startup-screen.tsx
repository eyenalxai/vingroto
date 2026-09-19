import { useKeyboard, useRenderer } from "@opentui/solid"
import { Show } from "solid-js"

import { StatusBar } from "@/components/status-bar"
import { useTheme } from "@/components/theme-provider"

interface StartupScreenProps {
  readonly endpoint: string | undefined
  readonly failure: string | undefined
  readonly retrying: boolean
}

const StartupScreen = (props: StartupScreenProps) => {
  const theme = useTheme()
  const renderer = useRenderer()

  const message = () => {
    if (props.failure !== undefined) {
      return props.failure
    }
    return props.retrying ? "connecting to the daemon…" : "ready"
  }

  useKeyboard((key) => {
    if ((key.ctrl && key.name === "c") || (key.name === "q" && !key.ctrl)) {
      key.preventDefault()
      renderer.destroy()
    }
  })

  return (
    <box flexGrow={1} flexDirection="column">
      <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center" gap={1}>
        <text fg={theme.text}>vingroto</text>
        <Show when={props.endpoint}>{(url) => <text fg={theme.muted}>{url()}</text>}</Show>
      </box>
      <StatusBar
        message={message()}
        busy={props.retrying}
        error={props.failure !== undefined}
        hint="q quit · ctrl+c quit app"
      />
    </box>
  )
}

export { StartupScreen, type StartupScreenProps }
