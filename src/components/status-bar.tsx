import { useTerminalDimensions } from "@opentui/solid"
import { Show } from "solid-js"

import { useTheme } from "@/components/theme-provider"

interface StatusBarProps {
  readonly message: string
  readonly syncing: boolean
  readonly hint: string
}

const hintMinimumWidth = 80

const StatusBar = (props: StatusBarProps) => {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()
  const hintVisible = () => dimensions().width >= hintMinimumWidth

  return (
    <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1} flexShrink={0}>
      <text
        fg={props.syncing ? theme.accent : theme.text}
        flexBasis={0}
        flexGrow={1}
        wrapMode="none"
        truncate
      >
        {props.message}
      </text>
      <Show when={hintVisible()}>
        <text fg={theme.muted} flexShrink={0} wrapMode="none" truncate>
          {props.hint}
        </text>
      </Show>
    </box>
  )
}

export { StatusBar, type StatusBarProps }
