import { Show } from "solid-js"

import type { BootReport } from "@/lib/boot"

import { theme } from "@/lib/theme"

interface StartupScreenProps {
  readonly report: BootReport | undefined
}

const StartupScreen = (props: StartupScreenProps) => {
  const failed = () => props.report?.config._tag === "error"
  const message = () => {
    const value = props.report
    if (value === undefined) {
      return "starting…"
    }
    if (value.config._tag === "error") {
      return value.config.message
    }
    return "preparing…"
  }
  return (
    <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center" gap={1}>
      <text fg={failed() ? theme.error : theme.muted}>{message()}</text>
      <Show when={props.report}>
        {(value) => <text fg={theme.muted}>{value().paths.config}</text>}
      </Show>
      <text fg={theme.muted}>q quit</text>
    </box>
  )
}

export { StartupScreen }
