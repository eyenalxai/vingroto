import { For, Show } from "solid-js"

import type { FieldDescriptor, FieldId } from "@/components/setup/form-model"

import { FieldRow } from "@/components/setup/form-fields"
import { useTheme } from "@/components/theme-provider"

interface AccountSetupViewProps {
  readonly mode: "initial" | "add"
  readonly step: "credentials" | "servers"
  readonly fields: readonly FieldDescriptor[]
  readonly focusedId: FieldId | undefined
  readonly valueOf: (id: FieldId) => string
  readonly discovering: boolean
  readonly source: string | undefined
  readonly status: string
  readonly statusError: boolean
  readonly hint: string
  readonly onInput: (id: FieldId, value: string) => void
}

const AccountSetupView = (props: AccountSetupViewProps) => {
  const theme = useTheme()
  return (
    <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center" gap={1}>
      <box
        width={72}
        flexDirection="column"
        border
        borderColor={theme.accent}
        title={props.mode === "initial" ? "welcome to vingroto" : "add account"}
        titleColor={theme.accent}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        gap={1}
      >
        <Show
          when={props.step === "credentials"}
          fallback={
            <text fg={theme.muted}>
              {props.discovering
                ? "detecting mail servers…"
                : (props.source ?? "servers not detected, enter them below")}
            </text>
          }
        >
          <text fg={theme.muted}>
            Enter your email and password. Mail servers are detected automatically.
          </text>
        </Show>
        <box flexDirection="column">
          <For each={props.fields}>
            {(field) => (
              <FieldRow
                field={field}
                focused={props.focusedId === field.id}
                value={props.valueOf(field.id)}
                onInput={(value) => {
                  props.onInput(field.id, value)
                }}
              />
            )}
          </For>
        </box>
        <text fg={props.statusError ? theme.error : theme.muted}>{props.status}</text>
        <text fg={theme.muted}>{props.hint}</text>
      </box>
    </box>
  )
}

export { AccountSetupView, type AccountSetupViewProps }
