import type { JSX } from "solid-js"

import { Show } from "solid-js"

import type { SettingsGroup, SettingsRow } from "@/components/settings/settings-rows"

import { settingsRowId } from "@/components/settings/settings-rows"
import { maskSecret, storedSecretMask } from "@/components/setup/form-model"
import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"
import { truncate } from "@/lib/format"

interface SettingsGroupHeaderViewProps {
  readonly group: SettingsGroup
  readonly selected: boolean
  readonly onSelect: (key: string) => void
}

interface SettingsRowViewProps {
  readonly row: SettingsRow
  readonly selected: boolean
  readonly editing: boolean
  readonly focused: boolean
  readonly onSelect: (key: string) => void
}

type RowProps<K extends SettingsRow["kind"]> = Omit<SettingsRowViewProps, "row"> & {
  readonly row: Extract<SettingsRow, { kind: K }>
}

interface RowFrameProps {
  readonly row: SettingsRow
  readonly selected: boolean
  readonly onSelect: (key: string) => void
  readonly children: JSX.Element
}

const labelWidth = 15
const mailboxNameWidth = 24

const RowFrame = (props: RowFrameProps) => {
  const theme = useTheme()
  return (
    <box
      id={settingsRowId(props.row.key)}
      flexDirection="row"
      gap={1}
      backgroundColor={props.selected ? theme.selectionBackground : "transparent"}
      onMouseDown={() => {
        props.onSelect(props.row.key)
      }}
    >
      {props.children}
    </box>
  )
}

const FieldLabel = (props: { readonly label: string; readonly selected: boolean }) => {
  const theme = useTheme()
  return (
    <box width={labelWidth} flexShrink={0}>
      <text fg={props.selected ? theme.selectionForeground : theme.muted} wrapMode="none" truncate>
        {props.label}
      </text>
    </box>
  )
}

const SettingsGroupHeaderView = (props: SettingsGroupHeaderViewProps) => {
  const theme = useTheme()
  const titleColor = () => {
    if (props.selected) {
      return theme.selectionForeground
    }
    return props.group.kind === "account" ? theme.accent : theme.text
  }
  return (
    <box
      id={settingsRowId(props.group.key)}
      flexDirection="row"
      gap={1}
      backgroundColor={props.selected ? theme.selectionBackground : "transparent"}
      onMouseDown={() => {
        props.onSelect(props.group.key)
      }}
    >
      <text fg={props.selected ? theme.selectionForeground : theme.muted}>
        {props.group.expanded() ? "▾" : "▸"}
      </text>
      <text fg={titleColor()} wrapMode="none" truncate>
        {props.group.title()}
      </text>
      <text fg={props.selected ? theme.selectionForeground : theme.muted} wrapMode="none" truncate>
        {props.group.summary()}
      </text>
      <Show when={props.group.pending?.() === true}>
        <Spinner color={props.selected ? theme.selectionForeground : theme.accent} />
      </Show>
      <Show when={props.group.dirty?.() === true}>
        <text fg={props.selected ? theme.selectionForeground : theme.unread}>●</text>
      </Show>
    </box>
  )
}

const TextRow = (props: RowProps<"text">) => {
  const theme = useTheme()
  const textColor = () => (props.selected ? theme.selectionForeground : theme.text)
  return (
    <RowFrame row={props.row} selected={props.selected} onSelect={props.onSelect}>
      <FieldLabel label={props.row.label} selected={props.selected} />
      <Show
        when={props.row.pending?.() === true}
        fallback={
          <input
            value={props.row.value()}
            onInput={props.row.input}
            focused={props.editing && props.focused}
            placeholder={props.row.placeholder ?? ""}
            placeholderColor={theme.muted}
            textColor={textColor()}
            focusedTextColor={textColor()}
            cursorColor={theme.accent}
            flexGrow={1}
          />
        }
      >
        <Spinner />
      </Show>
    </RowFrame>
  )
}

const SecretRow = (props: RowProps<"secret">) => {
  const theme = useTheme()
  return (
    <RowFrame row={props.row} selected={props.selected} onSelect={props.onSelect}>
      <FieldLabel label={props.row.label} selected={props.selected} />
      <text fg={props.selected ? theme.selectionForeground : theme.text} wrapMode="none" truncate>
        {`${props.row.value() === "" ? storedSecretMask : maskSecret(props.row.value())}${
          props.editing ? "▏" : ""
        }`}
      </text>
    </RowFrame>
  )
}

const ChoiceRow = (props: RowProps<"choice">) => {
  const theme = useTheme()
  return (
    <RowFrame row={props.row} selected={props.selected} onSelect={props.onSelect}>
      <FieldLabel label={props.row.label} selected={props.selected} />
      <text fg={props.selected ? theme.selectionForeground : theme.text} wrapMode="none" truncate>
        {props.row.value()}
      </text>
    </RowFrame>
  )
}

const ToggleRow = (props: RowProps<"toggle">) => {
  const theme = useTheme()
  const toggleColor = () => {
    if (!props.row.value()) {
      return theme.muted
    }
    return props.selected ? theme.selectionForeground : theme.unread
  }
  return (
    <RowFrame row={props.row} selected={props.selected} onSelect={props.onSelect}>
      <FieldLabel label={props.row.label} selected={props.selected} />
      <Show
        when={props.row.pending?.() === true}
        fallback={
          <text fg={toggleColor()} wrapMode="none" truncate>
            {props.row.value() ? "yes" : "no"}
          </text>
        }
      >
        <Spinner />
      </Show>
    </RowFrame>
  )
}

const ReadingRow = (props: RowProps<"reading">) => {
  const theme = useTheme()
  return (
    <RowFrame row={props.row} selected={props.selected} onSelect={props.onSelect}>
      <FieldLabel label={props.row.label} selected={props.selected} />
      <text fg={props.selected ? theme.selectionForeground : theme.muted} wrapMode="none" truncate>
        {props.row.value()}
      </text>
    </RowFrame>
  )
}

const ActionRow = (props: RowProps<"action">) => {
  const theme = useTheme()
  return (
    <RowFrame row={props.row} selected={props.selected} onSelect={props.onSelect}>
      <text fg={props.selected ? theme.selectionForeground : theme.accent} wrapMode="none" truncate>
        {props.row.label}
      </text>
    </RowFrame>
  )
}

const MailboxRow = (props: RowProps<"mailbox">) => {
  const theme = useTheme()
  const unreadColor = () => {
    if (props.row.unread() === 0) {
      return theme.muted
    }
    return props.selected ? theme.selectionForeground : theme.unread
  }
  return (
    <RowFrame row={props.row} selected={props.selected} onSelect={props.onSelect}>
      <box flexShrink={0}>
        <Show
          when={props.row.pending()}
          fallback={
            <text fg={props.selected ? theme.selectionForeground : theme.muted}>
              {props.row.muted ? "⊘" : " "}
            </text>
          }
        >
          <Spinner />
        </Show>
      </box>
      <box width={mailboxNameWidth} flexShrink={0}>
        <text fg={props.selected ? theme.selectionForeground : theme.text} wrapMode="none" truncate>
          {truncate(props.row.name, mailboxNameWidth)}
        </text>
      </box>
      <text
        fg={props.selected ? theme.selectionForeground : theme.muted}
        flexGrow={1}
        wrapMode="none"
        truncate
      >
        {props.row.path}
      </text>
      <text fg={unreadColor()} flexShrink={0} wrapMode="none">
        {`${String(props.row.unread())} unread`}
      </text>
    </RowFrame>
  )
}

const SettingsRowView = (props: SettingsRowViewProps) => {
  const row = props.row
  switch (row.kind) {
    case "text": {
      return <TextRow {...props} row={row} />
    }
    case "secret": {
      return <SecretRow {...props} row={row} />
    }
    case "choice": {
      return <ChoiceRow {...props} row={row} />
    }
    case "toggle": {
      return <ToggleRow {...props} row={row} />
    }
    case "reading": {
      return <ReadingRow {...props} row={row} />
    }
    case "action": {
      return <ActionRow {...props} row={row} />
    }
    case "mailbox": {
      return <MailboxRow {...props} row={row} />
    }
    default: {
      return row
    }
  }
}

export { SettingsGroupHeaderView, SettingsRowView, type SettingsRowViewProps }
