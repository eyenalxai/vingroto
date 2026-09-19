import type { KeyEvent } from "@opentui/core"
import type { AccountConfig, EditorConfig } from "@vingroto/core/config/schema"

import { useKeyboard, useRenderer } from "@opentui/solid"
import { Show } from "solid-js"

import type { ComposerField } from "@/components/composer/composer-fields"
import type { ComposerSeed } from "@/lib/mail/compose"
import type { AppRuntime } from "@/lib/runtime"

import { useComposer } from "@/components/composer/use-composer"
import { useTheme } from "@/components/theme-provider"
import { describeSystemEditor } from "@/lib/external"

interface ComposerScreenProps {
  readonly runtime: AppRuntime
  readonly accounts: readonly AccountConfig[]
  readonly seed: ComposerSeed
  readonly editor: EditorConfig
  readonly sendDelaySeconds: number
  readonly onClose: () => void
  readonly onDisconnected: (message: string) => void
}

const labelWidth = 8

const ComposerScreen = (props: ComposerScreenProps) => {
  const renderer = useRenderer()
  const theme = useTheme()
  const systemEditor = describeSystemEditor()
  const composer = useComposer({
    accounts: props.accounts,
    editor: () => props.editor,
    onClose: props.onClose,
    onDisconnected: props.onDisconnected,
    runtime: props.runtime,
    seed: props.seed,
    sendDelaySeconds: props.sendDelaySeconds,
  })

  const labelColor = (id: ComposerField) => {
    if (composer.invalidFields().has(id)) {
      return theme.error
    }
    return composer.field() === id ? theme.accent : theme.muted
  }

  const title = () => (composer.draftId() === undefined ? "compose" : "compose · draft")

  const hint = () =>
    composer.editing()
      ? "waiting for the editor…"
      : "tab next · ctrl+s queue · esc close · ctrl+c quit"

  useKeyboard((event: KeyEvent) => {
    if (event.ctrl && event.name === "c") {
      event.preventDefault()
      renderer.destroy()
      return
    }
    if (event.name === "tab") {
      event.preventDefault()
      composer.moveFocus(event.shift ? -1 : 1)
      return
    }
    if (event.name === "escape") {
      event.preventDefault()
      composer.close()
      return
    }
    if (event.ctrl && event.name === "s") {
      event.preventDefault()
      composer.enqueue()
      return
    }
    if (event.name === "return" && composer.field() === "body" && props.editor === "system") {
      event.preventDefault()
      composer.editExternally()
      return
    }
    if (composer.field() === "from") {
      if (event.name === "right" || event.name === "down") {
        event.preventDefault()
        composer.cycleFrom(1)
        return
      }
      if (event.name === "left" || event.name === "up") {
        event.preventDefault()
        composer.cycleFrom(-1)
        return
      }
      if (event.name === "return") {
        event.preventDefault()
        composer.moveFocus(1)
      }
      return
    }
    if (event.name === "return" && composer.field() !== "body") {
      event.preventDefault()
      composer.moveFocus(event.shift ? -1 : 1)
    }
  })

  return (
    <box flexGrow={1} flexDirection="column">
      <box
        flexGrow={1}
        flexDirection="column"
        gap={0}
        border
        borderColor={theme.accent}
        title={title()}
        titleColor={theme.accent}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={0}
      >
        <box flexDirection="row" gap={1} flexShrink={0}>
          <box width={labelWidth} flexShrink={0}>
            <text fg={labelColor("from")} wrapMode="none" truncate>
              From
            </text>
          </box>
          <text fg={composer.field() === "from" ? theme.text : theme.muted} flexGrow={1} truncate>
            {composer.fromLabel()}
          </text>
          {composer.field() === "from" ? (
            <text fg={theme.muted} flexShrink={0} wrapMode="none">
              ←/→ change
            </text>
          ) : undefined}
        </box>
        <box flexDirection="row" gap={1} flexShrink={0}>
          <box width={labelWidth} flexShrink={0}>
            <text fg={labelColor("to")} wrapMode="none" truncate>
              To
            </text>
          </box>
          <input
            value={composer.toText()}
            onInput={composer.inputTo}
            focused={composer.field() === "to"}
            placeholder="name <address>, …"
            placeholderColor={theme.muted}
            textColor={theme.text}
            focusedTextColor={theme.text}
            cursorColor={theme.accent}
            flexGrow={1}
          />
        </box>
        <box flexDirection="row" gap={1} flexShrink={0}>
          <box width={labelWidth} flexShrink={0}>
            <text fg={labelColor("cc")} wrapMode="none" truncate>
              Cc
            </text>
          </box>
          <input
            value={composer.ccText()}
            onInput={composer.inputCc}
            focused={composer.field() === "cc"}
            placeholder=""
            placeholderColor={theme.muted}
            textColor={theme.text}
            focusedTextColor={theme.text}
            cursorColor={theme.accent}
            flexGrow={1}
          />
        </box>
        <box flexDirection="row" gap={1} flexShrink={0}>
          <box width={labelWidth} flexShrink={0}>
            <text fg={labelColor("bcc")} wrapMode="none" truncate>
              Bcc
            </text>
          </box>
          <input
            value={composer.bccText()}
            onInput={composer.inputBcc}
            focused={composer.field() === "bcc"}
            placeholder=""
            placeholderColor={theme.muted}
            textColor={theme.text}
            focusedTextColor={theme.text}
            cursorColor={theme.accent}
            flexGrow={1}
          />
        </box>
        <box flexDirection="row" gap={1} flexShrink={0}>
          <box width={labelWidth} flexShrink={0}>
            <text fg={labelColor("subject")} wrapMode="none" truncate>
              Subject
            </text>
          </box>
          <input
            value={composer.subject()}
            onInput={composer.inputSubject}
            focused={composer.field() === "subject"}
            placeholder=""
            placeholderColor={theme.muted}
            textColor={theme.text}
            focusedTextColor={theme.text}
            cursorColor={theme.accent}
            flexGrow={1}
          />
        </box>
        <box flexGrow={1} flexDirection="row" gap={1} minHeight={3}>
          <box width={labelWidth} flexShrink={0}>
            <text fg={labelColor("body")} wrapMode="none" truncate>
              Body
            </text>
          </box>
          <Show
            when={props.editor === "builtin"}
            fallback={
              <text fg={composer.field() === "body" ? theme.text : theme.muted} wrapMode="none">
                {`enter to edit in ${systemEditor}`}
              </text>
            }
          >
            <textarea
              ref={(node) => {
                composer.setTextarea(node)
              }}
              initialValue={composer.body()}
              onContentChange={() => {
                composer.inputBody(composer.textarea()?.plainText ?? "")
              }}
              focused={composer.field() === "body"}
              placeholder="write your message…"
              placeholderColor={theme.muted}
              textColor={theme.text}
              focusedTextColor={theme.text}
              cursorColor={theme.accent}
              flexGrow={1}
            />
          </Show>
        </box>
      </box>
      <box flexDirection="row" gap={1} paddingLeft={2} paddingRight={2} flexShrink={0} height={1}>
        <text
          fg={composer.statusError() ? theme.error : theme.muted}
          flexGrow={1}
          wrapMode="none"
          truncate
        >
          {composer.status()}
        </text>
        <text fg={theme.muted} flexShrink={0} wrapMode="none" truncate>
          {hint()}
        </text>
      </box>
    </box>
  )
}

export { ComposerScreen, type ComposerScreenProps }
