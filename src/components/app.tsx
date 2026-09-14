import type { KeyEvent } from "@opentui/core"

import { useKeyboard, useRenderer } from "@opentui/solid"
import { Effect } from "effect"
import { For, Show, createResource, createSignal } from "solid-js"

import type { BootReport } from "@/lib/boot"
import type { AccountConfig } from "@/lib/config/schema"

import { useRuntime } from "@/components/runtime-provider"
import { boot } from "@/lib/boot"
import { Credential } from "@/lib/credential/service"

interface CredentialResult {
  readonly label: string
  readonly ok: boolean
  readonly detail: string
}

interface CredentialsState {
  readonly status: "idle" | "running" | "done"
  readonly results: readonly CredentialResult[]
}

const idleCredentials: CredentialsState = { status: "idle", results: [] }

const databaseLine = (report: BootReport) => {
  if (report.database._tag === "error") {
    return report.database.message
  }
  return `${report.database.mailboxes} mailbox(es) indexed`
}

const configLine = (report: BootReport) => {
  if (report.config._tag === "error") {
    return report.config.message
  }
  return `${report.config.config.accounts.length} account(s) configured`
}

const checkAccount = (account: AccountConfig) =>
  Credential.pipe(
    Effect.flatMap((credential) =>
      Effect.all([credential.get(account.username), credential.get(account.password)]),
    ),
    Effect.match({
      onFailure: (error) => {
        return { label: account.label, ok: false, detail: error.message }
      },
      onSuccess: () => {
        return {
          label: account.label,
          ok: true,
          detail: "username and password available via 1Password and the keyring",
        }
      },
    }),
  )

const App = () => {
  const runtime = useRuntime()
  const renderer = useRenderer()
  const [report] = createResource(async () => runtime.runPromise(boot))
  const [credentials, setCredentials] = createSignal<CredentialsState>(idleCredentials)

  const accounts = () => {
    const value = report()
    if (value === undefined || value.config._tag !== "ok") {
      return []
    }
    return value.config.config.accounts
  }

  const checkCredentials = () => {
    const list = accounts()
    if (list.length === 0 || credentials().status === "running") {
      return
    }
    setCredentials({ status: "running", results: [] })
    runtime.runFork(
      Effect.all(list.map((account) => checkAccount(account))).pipe(
        Effect.tap((results) =>
          Effect.sync(() => {
            setCredentials({ status: "done", results })
          }),
        ),
      ),
    )
  }

  useKeyboard((key: KeyEvent) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      renderer.destroy()
      return
    }
    if (key.name === "c" && !key.ctrl) {
      checkCredentials()
    }
  })

  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} gap={1}>
      <text>
        <strong>vingroto</strong> — a TUI mail client
      </text>
      <box border title="boot" flexDirection="column" padding={1}>
        <Show when={report()} fallback={<text>starting…</text>}>
          {(value) => (
            <box flexDirection="column">
              <text>config file · {value().paths.config}</text>
              <text>data · {value().paths.data}</text>
              <text>database · {databaseLine(value())}</text>
              <text>config · {configLine(value())}</text>
            </box>
          )}
        </Show>
      </box>
      <Show when={accounts().length > 0}>
        <box border title="accounts" flexDirection="column" padding={1}>
          <For each={accounts()}>
            {(account) => (
              <text>
                {account.label} · {account.email} · {account.imap.host}
              </text>
            )}
          </For>
        </box>
      </Show>
      <Show when={credentials().status !== "idle"}>
        <box border title="credentials" flexDirection="column" padding={1}>
          <Show when={credentials().status === "running"}>
            <text>checking 1Password and the login keyring…</text>
          </Show>
          <For each={credentials().results}>
            {(result) => (
              <text>
                {result.ok ? "✓" : "✗"} {result.label} · {result.detail}
              </text>
            )}
          </For>
        </box>
      </Show>
      <text fg="#6c6c6c">q quit · c check credentials</text>
    </box>
  )
}

export { App }
