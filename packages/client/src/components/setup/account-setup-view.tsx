import type { AuthMethod } from "@vingroto/core/config/schema"

import { useTerminalDimensions } from "@opentui/solid"
import { For, Show } from "solid-js"

import type { FieldDescriptor, FieldId } from "@/components/setup/form-model"

import { FieldRow } from "@/components/setup/form-fields"
import { Spinner } from "@/components/spinner"
import { StatusBar } from "@/components/status-bar"
import { useTheme } from "@/components/theme-provider"

interface AccountSetupViewProps {
  readonly mode: "initial" | "add"
  readonly step: "credentials" | "servers"
  readonly auth: AuthMethod
  readonly fields: readonly FieldDescriptor[]
  readonly focusedId: FieldId | undefined
  readonly valueOf: (id: FieldId) => string
  readonly discovering: boolean
  readonly busy: boolean
  readonly source: string | undefined
  readonly status: string
  readonly statusError: boolean
  readonly hint: string
  readonly onInput: (id: FieldId, value: string) => void
}

const panelPreferredWidth = 72

const AccountSetupView = (props: AccountSetupViewProps) => {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()

  const panelWidth = () => Math.min(panelPreferredWidth, Math.max(1, dimensions().width - 4))
  const title = () =>
    `${props.mode === "initial" ? "welcome to vingroto" : "add account"} · ${props.step}`

  return (
    <box flexGrow={1} flexDirection="column">
      <box
        flexGrow={1}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        paddingLeft={2}
        paddingRight={2}
      >
        <box
          width={panelWidth()}
          flexDirection="column"
          border
          borderColor={theme.accent}
          title={title()}
          titleColor={theme.accent}
          paddingLeft={1}
          paddingRight={1}
          gap={1}
        >
          <Show
            when={props.step === "credentials"}
            fallback={
              <Show
                when={props.discovering}
                fallback={
                  <text fg={theme.muted}>
                    {props.source ?? "servers not detected, enter them below"}
                  </text>
                }
              >
                <Spinner label="detecting mail servers…" />
              </Show>
            }
          >
            <text fg={theme.muted}>
              {props.auth === "oauth2"
                ? "sign in with Google: enter your OAuth client ID; the client secret is optional."
                : "enter your email and password. mail servers are detected automatically."}
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
        </box>
      </box>
      <StatusBar
        message={props.status}
        busy={props.busy}
        error={props.statusError}
        hint={props.hint}
      />
    </box>
  )
}

export { AccountSetupView, type AccountSetupViewProps }
