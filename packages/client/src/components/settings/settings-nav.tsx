import type { ScrollBoxRenderable } from "@opentui/core"

import { For, Show, createEffect, createMemo, createSignal } from "solid-js"

import type { SettingsEntry, SettingsGroup } from "@/components/settings/settings-entries"

import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"
import { truncate } from "@/lib/format"

interface SettingsNavProps {
  readonly query: string
  readonly onQuery: (value: string) => void
  readonly groups: readonly SettingsGroup[]
  readonly collapsed: ReadonlySet<string>
  readonly mutingIds: ReadonlySet<number>
  readonly mutingAccounts: ReadonlySet<string>
  readonly selectedKey: string | undefined
  readonly searchFocused: boolean
  readonly onSelect: (key: string) => void
  readonly onActivate: (key: string) => void
}

interface SettingsRowProps {
  readonly entry: SettingsEntry
  readonly query: string
  readonly collapsed: ReadonlySet<string>
  readonly mutingIds: ReadonlySet<number>
  readonly mutingAccounts: ReadonlySet<string>
  readonly selected: boolean
  readonly onSelect: (key: string) => void
  readonly onActivate: (key: string) => void
}

const rowId = (key: string) => `settings-row-${key.replaceAll(":", "-")}`

const groupCollapsed = (entry: SettingsEntry, query: string, collapsed: ReadonlySet<string>) =>
  entry.kind === "folder-group" && query.trim().length === 0 && collapsed.has(entry.accountId)

const isMuting = (
  entry: SettingsEntry,
  mutingIds: ReadonlySet<number>,
  accounts: ReadonlySet<string>,
) => {
  if (entry.kind === "folder") {
    return mutingIds.has(entry.mailboxId)
  }
  if (entry.kind === "folder-group") {
    return accounts.has(entry.accountId)
  }
  return false
}

const SettingsRow = (props: SettingsRowProps) => {
  const theme = useTheme()
  const collapsed = () => groupCollapsed(props.entry, props.query, props.collapsed)
  const muted = () => props.entry.kind === "folder" && props.entry.muted
  const textColor = () => {
    if (props.selected) {
      return theme.selectionForeground
    }
    return props.entry.kind === "folder-group" ? theme.accent : theme.text
  }
  const markerColor = () => (props.selected ? theme.selectionForeground : theme.muted)
  const marker = () => {
    if (props.entry.kind === "folder-group") {
      return collapsed() ? "▸" : "▾"
    }
    return muted() ? "⊘" : " "
  }
  const titleWidth = () => (props.entry.kind === "folder" ? 26 : 28)
  return (
    <box
      id={rowId(props.entry.key)}
      flexDirection="row"
      gap={1}
      paddingLeft={props.entry.kind === "folder" ? 2 : 0}
      backgroundColor={props.selected ? theme.selectionBackground : undefined}
      onMouseDown={() => {
        props.onSelect(props.entry.key)
        props.onActivate(props.entry.key)
      }}
    >
      <box flexShrink={0}>
        <Show
          when={isMuting(props.entry, props.mutingIds, props.mutingAccounts)}
          fallback={<text fg={markerColor()}>{marker()}</text>}
        >
          <Spinner />
        </Show>
      </box>
      <text fg={textColor()} wrapMode="none" truncate>
        {truncate(props.entry.title, titleWidth())}
      </text>
    </box>
  )
}

const SettingsNav = (props: SettingsNavProps) => {
  const theme = useTheme()
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  const selectedIsGroup = createMemo(() =>
    props.groups.some((group) =>
      group.entries.some(
        (entry) => entry.key === props.selectedKey && entry.kind === "folder-group",
      ),
    ),
  )

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
                {(entry) => (
                  <SettingsRow
                    entry={entry}
                    query={props.query}
                    collapsed={props.collapsed}
                    mutingIds={props.mutingIds}
                    mutingAccounts={props.mutingAccounts}
                    selected={entry.key === props.selectedKey}
                    onSelect={props.onSelect}
                    onActivate={props.onActivate}
                  />
                )}
              </For>
            </>
          )}
        </For>
      </scrollbox>
      <box paddingLeft={1} paddingRight={1} flexShrink={0}>
        <text fg={theme.muted} wrapMode="none" truncate>
          {`↑↓ move · ⏎ ${selectedIsGroup() ? "toggle" : "edit"} · esc close`}
        </text>
      </box>
    </box>
  )
}

export { SettingsNav, type SettingsNavProps }
