import type { ScrollBoxRenderable } from "@opentui/core"

import { For, Show, createEffect, createSignal } from "solid-js"

import type { SettingsGroup } from "@/components/settings/settings-entries"

import { useTheme } from "@/components/theme-provider"
import { truncate } from "@/lib/format"

interface SettingsNavProps {
  readonly query: string
  readonly onQuery: (value: string) => void
  readonly groups: readonly SettingsGroup[]
  readonly selectedKey: string | undefined
  readonly searchFocused: boolean
  readonly onSelect: (key: string) => void
  readonly onActivate: (key: string) => void
}

const rowId = (key: string) => `settings-row-${key.replaceAll(":", "-")}`

const SettingsNav = (props: SettingsNavProps) => {
  const theme = useTheme()
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  createEffect(() => {
    const box = scrollBox()
    const selected = props.selectedKey
    if (box !== undefined && selected !== undefined) {
      box.scrollChildIntoView(rowId(selected))
    }
  })

  return (
    <box
      width={36}
      flexShrink={0}
      flexDirection="column"
      border
      borderColor={theme.border}
      title="settings"
      titleColor={theme.muted}
    >
      <box paddingLeft={1} paddingRight={1} flexShrink={0}>
        <input
          value={props.query}
          onInput={props.onQuery}
          focused={props.searchFocused}
          placeholder="search settings…"
          placeholderColor={theme.muted}
          textColor={theme.text}
          focusedTextColor={theme.text}
          cursorColor={theme.accent}
          flexGrow={1}
        />
      </box>
      <scrollbox
        ref={(box) => {
          setScrollBox(box)
        }}
        flexGrow={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Show when={props.groups.length === 0}>
          <text fg={theme.muted} wrapMode="none" truncate>
            no matches
          </text>
        </Show>
        <For each={props.groups}>
          {(group) => (
            <>
              <box paddingTop={1}>
                <text fg={theme.muted} wrapMode="none" truncate>
                  {group.section}
                </text>
              </box>
              <For each={group.entries}>
                {(entry) => {
                  const isSelected = () => entry.key === props.selectedKey
                  return (
                    <box
                      id={rowId(entry.key)}
                      flexDirection="row"
                      gap={1}
                      backgroundColor={isSelected() ? theme.selectionBackground : undefined}
                      onMouseDown={() => {
                        props.onSelect(entry.key)
                        props.onActivate(entry.key)
                      }}
                    >
                      <text
                        fg={isSelected() ? theme.selectionForeground : theme.muted}
                        flexShrink={0}
                      >
                        {entry.kind === "folder" && entry.muted ? "⊘" : " "}
                      </text>
                      <text
                        fg={isSelected() ? theme.selectionForeground : theme.text}
                        wrapMode="none"
                        truncate
                      >
                        {truncate(entry.title, 28)}
                      </text>
                    </box>
                  )
                }}
              </For>
            </>
          )}
        </For>
      </scrollbox>
      <box paddingLeft={1} paddingRight={1} flexShrink={0}>
        <text fg={theme.muted} wrapMode="none" truncate>
          ↑↓ move · ⏎ edit · esc close
        </text>
      </box>
    </box>
  )
}

export { SettingsNav, type SettingsNavProps }
