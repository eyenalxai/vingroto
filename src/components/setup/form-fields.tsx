import type { FieldDescriptor } from "@/components/setup/form-model"

import { maskSecret, securityLabel } from "@/components/setup/form-model"
import { useTheme } from "@/components/theme-provider"

interface FieldRowProps<Id extends string> {
  readonly field: FieldDescriptor<Id>
  readonly focused: boolean
  readonly value: string
  readonly onInput: (value: string) => void
}

const labelWidth = 15

const FieldRow = <Id extends string>(props: FieldRowProps<Id>) => {
  const theme = useTheme()
  const labelColor = () => (props.focused ? theme.accent : theme.muted)
  const valueColor = () => (props.focused ? theme.text : theme.muted)
  if (props.field.kind === "text") {
    return (
      <box flexDirection="row" gap={1}>
        <box width={labelWidth} flexShrink={0}>
          <text fg={labelColor()} wrapMode="none" truncate>
            {props.field.label}
          </text>
        </box>
        <input
          value={props.value}
          onInput={props.onInput}
          focused={props.focused}
          placeholder={props.field.placeholder ?? ""}
          placeholderColor={theme.muted}
          textColor={theme.text}
          focusedTextColor={theme.text}
          cursorColor={theme.accent}
          flexGrow={1}
        />
      </box>
    )
  }
  return (
    <box flexDirection="row" gap={1}>
      <box width={labelWidth} flexShrink={0}>
        <text fg={labelColor()} wrapMode="none" truncate>
          {props.field.label}
        </text>
      </box>
      <box flexGrow={1} flexDirection="row">
        <text fg={valueColor()} wrapMode="none" truncate>
          {props.field.kind === "secret"
            ? `${maskSecret(props.value)}${props.focused ? "▏" : ""}`
            : securityLabel(props.value)}
        </text>
      </box>
    </box>
  )
}

export { FieldRow, type FieldRowProps }
