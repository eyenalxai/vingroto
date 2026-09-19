import type { Accessor } from "solid-js"

import { For, Show } from "solid-js"

import type { SettingsSection } from "@/components/settings/settings-rows"

import { SettingsRowView } from "@/components/settings/settings-row"
import { useTheme } from "@/components/theme-provider"

interface SettingsSectionViewProps {
  readonly section: Accessor<SettingsSection>
  readonly selectedKey: Accessor<string | undefined>
  readonly editingKey: Accessor<string | undefined>
  readonly onSelect: (key: string) => void
}

const SettingsSectionView = (props: SettingsSectionViewProps) => {
  const theme = useTheme()
  return (
    <box flexDirection="column">
      <box paddingTop={1}>
        <text fg={theme.accent}>{props.section().title}</text>
      </box>
      <For each={props.section().blocks}>
        {(block) => (
          <box flexDirection="column" paddingBottom={1}>
            <Show when={block.title}>{(title) => <text fg={theme.text}>{title()}</text>}</Show>
            <Show when={block.rows.length === 0 ? block.note : undefined}>
              {(note) => <text fg={theme.muted}>{note()}</text>}
            </Show>
            <For each={block.rows}>
              {(row) => (
                <SettingsRowView
                  row={row}
                  selected={row.key === props.selectedKey()}
                  editing={row.key === props.editingKey()}
                  onSelect={props.onSelect}
                />
              )}
            </For>
          </box>
        )}
      </For>
    </box>
  )
}

export { SettingsSectionView, type SettingsSectionViewProps }
