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
      <box width={2} flexShrink={0} height={1}>
        <Show when={props.busy}>
          <Spinner color={theme.accent} />
        </Show>
      </box>
      <text fg={theme.text} flexBasis={0} flexGrow={1} wrapMode="none" truncate>
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
