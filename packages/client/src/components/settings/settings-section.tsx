import type { Accessor } from "solid-js"

import { For, Show } from "solid-js"

import type { SettingsSection } from "@/components/settings/settings-rows"

import { SettingsGroupHeaderView, SettingsRowView } from "@/components/settings/settings-row"
import { useTheme } from "@/components/theme-provider"

interface SettingsSectionViewProps {
  readonly section: Accessor<SettingsSection>
  readonly selectedKey: Accessor<string | undefined>
  readonly editingKey: Accessor<string | undefined>
  readonly focused: Accessor<boolean>
  readonly onSelectGroup: (key: string) => void
  readonly onSelectRow: (key: string) => void
}

const SettingsSectionView = (props: SettingsSectionViewProps) => {
  const theme = useTheme()
  return (
    <box flexDirection="column">
      <For each={props.section().groups}>
        {(group, index) => (
          <box
            flexDirection="column"
            paddingBottom={
              index() < props.section().groups.length - 1 || props.section().rows.length > 0 ? 1 : 0
            }
          >
            <SettingsGroupHeaderView
              group={group}
              selected={group.key === props.selectedKey()}
              onSelect={props.onSelectGroup}
            />
            <Show when={group.expanded()}>
              <box flexDirection="column" paddingLeft={2}>
                <Show when={group.rows.length === 0 ? group.note : undefined}>
                  {(note) => <text fg={theme.muted}>{note()}</text>}
                </Show>
                <For each={group.rows}>
                  {(row) => (
                    <SettingsRowView
                      row={row}
                      selected={row.key === props.selectedKey()}
                      editing={row.key === props.editingKey()}
                      focused={props.focused()}
                      onSelect={props.onSelectRow}
                    />
                  )}
                </For>
              </box>
            </Show>
          </box>
        )}
      </For>
      <For each={props.section().rows}>
        {(row) => (
          <SettingsRowView
            row={row}
            selected={row.key === props.selectedKey()}
            editing={row.key === props.editingKey()}
            focused={props.focused()}
            onSelect={props.onSelectRow}
          />
        )}
      </For>
    </box>
  )
}

export { SettingsSectionView, type SettingsSectionViewProps }
