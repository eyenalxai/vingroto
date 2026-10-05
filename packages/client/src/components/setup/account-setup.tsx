import type { KeyEvent } from "@opentui/core"
import type { AccountConfig } from "@vingroto/core/config/schema"

import { useKeyboard, usePaste, useRenderer } from "@opentui/solid"
import { onCleanup } from "solid-js"

import type { FieldId } from "@/components/setup/form-model"

import { handleQuitKey } from "@/components/quit-key"
import { AccountSetupView } from "@/components/setup/account-setup-view"
import { useAccountSetup } from "@/components/setup/use-account-setup"

interface AccountSetupProps {
  readonly accounts: readonly AccountConfig[]
  readonly mode: "initial" | "add"
  readonly onSaved: (account: AccountConfig) => void
  readonly onCancel: (() => void) | undefined
}

const AccountSetup = (props: AccountSetupProps) => {
  const renderer = useRenderer()
  const form = useAccountSetup({ accounts: props.accounts, onSaved: props.onSaved })

  const handleChoice = (id: FieldId, event: KeyEvent) => {
    const backward = event.name === "left" || event.name === "h"
    const forward = event.name === "right" || event.name === "l" || event.name === "space"
    if (!backward && !forward) {
      return
    }
    event.preventDefault()
    form.cycleField(id, backward ? -1 : 1)
  }

  const handleGlobalKey = (event: KeyEvent) => {
    if (handleQuitKey({ renderer }, event)) {
      event.preventDefault()
      return true
    }
    if (event.name === "tab") {
      event.preventDefault()
      form.moveFocus(event.shift ? -1 : 1)
      return true
    }
    if (event.name === "escape") {
      event.preventDefault()
      if (form.step() === "servers") {
        form.goToStep("credentials")
      } else if (!form.cancel()) {
        props.onCancel?.()
      }
      return true
    }
    if (event.ctrl && event.name === "s") {
      event.preventDefault()
      form.save()
      return true
    }
    return false
  }

  const handleActiveKey = (event: KeyEvent) => {
    const active = form.focusedField()
    if (active === undefined) {
      return
    }
    if (event.name === "return") {
      event.preventDefault()
      form.enter()
      return
    }
    if (active.kind === "secret") {
      event.preventDefault()
      form.applySecret(event)
      return
    }
    if (active.kind === "security" || active.kind === "auth") {
      handleChoice(active.id, event)
    }
  }

  useKeyboard((event: KeyEvent) => {
    if (event.eventType === "release") {
      return
    }
    if (handleGlobalKey(event)) {
      return
    }
    handleActiveKey(event)
  })

  usePaste((event) => {
    if (form.focusedField()?.kind !== "secret") {
      return
    }
    const text = new TextDecoder().decode(event.bytes).replaceAll("\r", "").replaceAll("\n", "")
    if (text.length > 0) {
      form.appendSecret(text)
    }
  })

  onCleanup(() => {
    form.dispose()
  })

  const hint = () => {
    if (form.authorizing()) {
      return "esc cancel sign-in · ctrl+c quit app"
    }
    if (form.step() === "credentials") {
      const cancel = props.onCancel === undefined ? "" : " · esc cancel"
      return `tab next · ⏎ continue${cancel} · ctrl+c quit app`
    }
    return "tab next · ⏎ save · esc back · ctrl+c quit app"
  }

  return (
    <AccountSetupView
      mode={props.mode}
      step={form.step()}
      auth={form.auth()}
      fields={form.fields()}
      focusedId={form.focusedField()?.id}
      valueOf={form.fieldValue}
      discovering={form.discovering()}
      busy={form.busy()}
      source={form.source()}
      status={form.status()}
      statusError={form.statusError()}
      hint={hint()}
      onInput={form.input}
    />
  )
}

export { AccountSetup, type AccountSetupProps }
