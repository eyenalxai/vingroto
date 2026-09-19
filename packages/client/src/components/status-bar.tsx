import { Show } from "solid-js"

import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"

interface StatusBarProps {
  readonly message: string
  readonly busy: boolean
  readonly hint: string
  readonly error?: boolean
}

const StatusBar = (props: StatusBarProps) => {
  const theme = useTheme()

  return (
    <box flexDirection="column" flexShrink={0} paddingLeft={1} paddingRight={1}>
      <box flexDirection="row" gap={1}>
        <box width={2} flexShrink={0}>
          <Show when={props.busy}>
            <Spinner color={theme.accent} />
          </Show>
        </box>
        <text fg={props.error === true ? theme.error : theme.text} flexGrow={1}>
          {props.message}
        </text>
      </box>
      <text fg={theme.muted}>{props.hint}</text>
    </box>
  )
}

export { StatusBar, type StatusBarProps }
