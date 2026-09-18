import type { KeyEvent } from "@opentui/core"

import { useKeyboard, useRenderer } from "@opentui/solid"
import { createSignal } from "solid-js"

import { useTheme } from "@/components/theme-provider"

interface RenameMailboxProps {
  readonly initial: string
  readonly error: string
  readonly onCancel: () => void
  readonly onSubmit: (value: string) => void
}

const RenameMailbox = (props: RenameMailboxProps) => {
  const renderer = useRenderer()
  const theme = useTheme()
  const [value, setValue] = createSignal(props.initial)
  const [localError, setLocalError] = createSignal("")

  const submit = () => {
    const trimmed = value().trim()
    if (trimmed.length === 0) {
      setLocalError("enter a mailbox name")
      return
    }
    props.onSubmit(trimmed)
  }

  const message = () => {
    const local = localError()
    if (local.length > 0) {
      return local
    }
    if (props.error.length > 0) {
      return props.error
    }
    return "enter save · esc cancel"
  }

  const messageColor = () =>
    localError().length > 0 || props.error.length > 0 ? theme.error : theme.muted

  useKeyboard((event: KeyEvent) => {
    if (event.eventType === "release") {
      return
    }
    if (event.ctrl && event.name === "c") {
      event.preventDefault()
      renderer.destroy()
      return
    }
    if (event.name === "escape") {
      event.preventDefault()
      props.onCancel()
      return
    }
    if (event.name === "return") {
      event.preventDefault()
      submit()
    }
  })

  return (
    <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center" gap={1}>
      <box
        width={64}
        flexDirection="column"
        border
        borderColor={theme.accent}
        title="rename mailbox"
        titleColor={theme.accent}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        gap={1}
      >
        <text fg={theme.muted}>Choose a new name for this mailbox.</text>
        <input
          value={value()}
          onInput={(next) => {
            setLocalError("")
            setValue(next)
          }}
          focused
          textColor={theme.text}
          focusedTextColor={theme.text}
          cursorColor={theme.accent}
          flexGrow={1}
        />
        <text fg={messageColor()}>{message()}</text>
      </box>
    </box>
  )
}

export { RenameMailbox, type RenameMailboxProps }
