import type { FieldDescriptor } from "@/components/setup/form-model"

import { authLabel } from "@/components/setup/credential-fields"
import { maskSecret, securityLabel, storedSecretMask } from "@/components/setup/form-model"
import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"

interface FieldRowProps<Id extends string> {
  readonly field: FieldDescriptor<Id>
  readonly focused: boolean
  readonly value: string
  readonly stored?: boolean
  readonly pending?: boolean
  readonly onInput: (value: string) => void
}

const labelWidth = 15

const FieldRow = <Id extends string>(props: FieldRowProps<Id>) => {
  const theme = useTheme()
  const labelColor = () => (props.focused ? theme.accent : theme.muted)
  const valueColor = () => (props.focused ? theme.text : theme.muted)
  const secretText = () =>
    props.value === "" && props.stored === true ? storedSecretMask : maskSecret(props.value)
  const choiceText = () =>
    props.field.kind === "auth" ? authLabel(props.value) : securityLabel(props.value)
  if (props.pending === true) {
    return (
      <box flexDirection="row" gap={1}>
        <box width={labelWidth} flexShrink={0}>
          <text fg={labelColor()} wrapMode="none" truncate>
            {props.field.label}
          </text>
        </box>
        <box flexGrow={1} flexDirection="row">
          <Spinner />
        </box>
      </box>
    )
  }
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
  if (props.field.kind === "boolean") {
    return (
      <box flexDirection="row" gap={1}>
        <box width={labelWidth} flexShrink={0}>
          <text fg={labelColor()} wrapMode="none" truncate>
            {props.field.label}
          </text>
        </box>
        <box flexGrow={1} flexDirection="row">
          <text fg={valueColor()} wrapMode="none" truncate>
            {props.value}
          </text>
        </box>
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
            ? `${secretText()}${props.focused ? "▏" : ""}`
            : choiceText()}
        </text>
      </box>
    </box>
  )
}

export { FieldRow, type FieldRowProps }
