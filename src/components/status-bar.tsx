import { theme } from "@/lib/theme"

interface StatusBarProps {
  readonly message: string
  readonly syncing: boolean
  readonly hint: string
}

const StatusBar = (props: StatusBarProps) => (
  <box flexDirection="row" justifyContent="space-between" gap={1} paddingLeft={1} paddingRight={1}>
    <box flexDirection="row" gap={1}>
      <text fg={props.syncing ? theme.unread : theme.muted}>
        {props.syncing ? "syncing" : "ready"}
      </text>
      <text fg={theme.text}>{props.message}</text>
    </box>
    <text fg={theme.muted}>{props.hint}</text>
  </box>
)

export { StatusBar }
