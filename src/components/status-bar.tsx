import { useTerminalDimensions } from "@opentui/solid"
import { Show } from "solid-js"

import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"

interface StatusBarProps {
  readonly message: string
  readonly busy: boolean
  readonly hint: string
}

const hintMinimumWidth = 80

const StatusBar = (props: StatusBarProps) => {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()
  const hintVisible = () => dimensions().width >= hintMinimumWidth

  return (
    <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1} flexShrink={0}>
      <Show
        when={props.busy}
        fallback={
          <text fg={theme.text} flexBasis={0} flexGrow={1} wrapMode="none" truncate>
            {props.message}
          </text>
        }
      >
        <box flexBasis={0} flexGrow={1} flexDirection="row" overflow="hidden">
          <Spinner label={props.message} color={theme.accent} />
        </box>
      </Show>
      <Show when={hintVisible()}>
        <text fg={theme.muted} flexShrink={0} wrapMode="none" truncate>
          {props.hint}
        </text>
      </Show>
    </box>
  )
}

export { StatusBar, type StatusBarProps }
