import { useKeyboard, useRenderer } from "@opentui/solid"
import { Show } from "solid-js"

import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"

interface StartupScreenProps {
  readonly endpoint: string | undefined
  readonly failure: string | undefined
  readonly retrying: boolean
}

const StartupScreen = (props: StartupScreenProps) => {
  const theme = useTheme()
  const renderer = useRenderer()

  const label = () => (props.failure === undefined ? "connecting to the daemon…" : "retrying…")
  const color = () => (props.failure === undefined ? theme.muted : theme.error)

  useKeyboard((key) => {
    if ((key.ctrl && key.name === "c") || (key.name === "q" && !key.ctrl)) {
      key.preventDefault()
      renderer.destroy()
    }
  })

  return (
    <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center" gap={1}>
      <Show when={props.retrying}>
        <Spinner label={label()} color={color()} />
      </Show>
      <Show when={props.failure}>{(message) => <text fg={theme.error}>{message()}</text>}</Show>
      <Show when={props.endpoint}>{(url) => <text fg={theme.muted}>{url()}</text>}</Show>
      <text fg={theme.muted}>q quit</text>
    </box>
  )
}

export { StartupScreen, type StartupScreenProps }
