import type { ScrollBoxRenderable } from "@opentui/core"
import type { Accessor } from "solid-js"

import { For, Show, createEffect, createSignal } from "solid-js"

import type { SettingsSection } from "@/components/settings/settings-rows"

import { settingsRowId, settingsSectionId } from "@/components/settings/settings-rows"
import { SettingsSectionView } from "@/components/settings/settings-section"
import { useTheme } from "@/components/theme-provider"

interface SettingsSectionsPaneProps {
  readonly width: number | "100%"
  readonly sections: Accessor<readonly SettingsSection[]>
  readonly selectedKey: Accessor<string | undefined>
  readonly focused: Accessor<boolean>
  readonly onSelect: (key: string) => void
}

interface SettingsContentPaneProps {
  readonly title: string
  readonly section: Accessor<SettingsSection | undefined>
  readonly selectedKey: Accessor<string | undefined>
  readonly editingKey: Accessor<string | undefined>
  readonly focused: Accessor<boolean>
  readonly onSelectGroup: (key: string) => void
  readonly onSelectRow: (key: string) => void
}

const SettingsSectionsPane = (props: SettingsSectionsPaneProps) => {
  const theme = useTheme()
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  createEffect(() => {
    const box = scrollBox()
    const key = props.selectedKey()
    if (box !== undefined && key !== undefined) {
      box.scrollChildIntoView(settingsSectionId(key))
    }
  })

  return (
    <box
      width={props.width}
      flexDirection="column"
      border
      borderColor={props.focused() ? theme.accent : theme.border}
      title="settings · sections"
      titleColor={props.focused() ? theme.accent : theme.muted}
    >
      <scrollbox
        ref={(box) => {
          setScrollBox(box)
        }}
        flexGrow={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <For each={props.sections()}>
          {(section) => {
            const selected = () => section.key === props.selectedKey()
            return (
              <box
                id={settingsSectionId(section.key)}
                flexDirection="row"
                gap={1}
                backgroundColor={selected() ? theme.selectionBackground : "transparent"}
                onMouseDown={() => {
                  props.onSelect(section.key)
                }}
              >
                <text fg={selected() ? theme.selectionForeground : theme.text}>
                  {section.title}
                </text>
                <Show when={section.dirty?.() === true}>
                  <text fg={selected() ? theme.selectionForeground : theme.unread}>●</text>
                </Show>
              </box>
            )
          }}
        </For>
      </scrollbox>
    </box>
  )
}

const SettingsContentPane = (props: SettingsContentPaneProps) => {
  const theme = useTheme()
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  createEffect(() => {
    const box = scrollBox()
    const key = props.selectedKey()
    if (box !== undefined && key !== undefined) {
      box.scrollChildIntoView(settingsRowId(key))
    }
  })

  return (
    <box
      flexGrow={1}
      flexBasis={0}
      flexDirection="column"
      border
      borderColor={props.focused() ? theme.accent : theme.border}
      title={props.title}
      titleColor={props.focused() ? theme.accent : theme.muted}
    >
      <scrollbox
        ref={(box) => {
          setScrollBox(box)
        }}
        flexGrow={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Show when={props.section()}>
          {(section) => (
            <SettingsSectionView
              section={section}
              selectedKey={props.selectedKey}
              editingKey={props.editingKey}
              focused={props.focused}
              onSelectGroup={props.onSelectGroup}
              onSelectRow={props.onSelectRow}
            />
          )}
        </Show>
      </scrollbox>
    </box>
  )
}

export {
  SettingsContentPane,
  SettingsSectionsPane,
  type SettingsContentPaneProps,
  type SettingsSectionsPaneProps,
}
