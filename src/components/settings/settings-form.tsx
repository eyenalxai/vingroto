import type { JSX } from "solid-js"

import { For, Show } from "solid-js"

import type { FieldDescriptor } from "@/components/setup/form-model"

import { FieldRow } from "@/components/setup/form-fields"
import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"

interface SettingsFormProps<Id extends string> {
  readonly fields: readonly FieldDescriptor<Id>[]
  readonly focusedId: Id | undefined
  readonly active: boolean
  readonly valueOf: (id: Id) => string
  readonly onInput: (id: Id, value: string) => void
  readonly status: string
  readonly statusError: boolean
  readonly pending?: boolean
  readonly fieldPending?: (id: Id) => boolean
  readonly hint: string
  readonly children?: JSX.Element
}

const SettingsForm = <Id extends string>(props: SettingsFormProps<Id>) => {
  const theme = useTheme()
  return (
    <box
      flexGrow={1}
      flexDirection="column"
      gap={1}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
    >
      {props.children}
      <box flexDirection="column">
        <For each={props.fields}>
          {(field) => (
            <FieldRow
              field={field}
              focused={props.active && props.focusedId === field.id}
              value={props.valueOf(field.id)}
              pending={props.fieldPending?.(field.id) ?? false}
              onInput={(value) => {
                props.onInput(field.id, value)
              }}
            />
          )}
        </For>
      </box>
      <Show
        when={props.pending === true}
        fallback={<text fg={props.statusError ? theme.error : theme.muted}>{props.status}</text>}
      >
        <Spinner label={props.status} />
      </Show>
      <text fg={theme.muted}>{props.hint}</text>
    </box>
  )
}

export { SettingsForm, type SettingsFormProps }
