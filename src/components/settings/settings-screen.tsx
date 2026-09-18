import type { KeyEvent } from "@opentui/core"

import { useKeyboard, useRenderer } from "@opentui/solid"
import { Effect } from "effect"
import { createEffect, createMemo, createSignal } from "solid-js"

import type { AccountConfig, SyncConfig } from "@/lib/config/schema"
import type { MailboxRow } from "@/lib/store/mailboxes"
import type { MailboxCounts } from "@/lib/store/messages"

import { useRuntime } from "@/components/runtime-provider"
import { SettingsDetail } from "@/components/settings/settings-detail"
import {
  buildSettingsEntries,
  filterSettingsEntries,
  groupSettingsEntries,
} from "@/components/settings/settings-entries"
import { SettingsNav } from "@/components/settings/settings-nav"
import { useAccountProfile } from "@/components/settings/use-account-profile"
import { useSyncProfile } from "@/components/settings/use-sync-profile"
import { useTheme } from "@/components/theme-provider"
import { describeError } from "@/lib/errors"
import { setMailboxMuted } from "@/lib/store/mailboxes"

interface SettingsScreenProps {
  readonly accounts: readonly AccountConfig[]
  readonly mailboxes: readonly MailboxRow[]
  readonly counts: ReadonlyMap<number, MailboxCounts>
  readonly sync: SyncConfig
  readonly onAddAccount: () => void
  readonly onClose: () => void
  readonly onAccountSaved: (account: AccountConfig) => void
  readonly onMailboxChanged: () => void
  readonly onSyncSaved: () => void
}

const SettingsScreen = (props: SettingsScreenProps) => {
  const runtime = useRuntime()
  const renderer = useRenderer()
  const theme = useTheme()
  const [query, setQuery] = createSignal("")
  const [zone, setZone] = createSignal<"nav" | "detail">("nav")
  const [status, setStatus] = createSignal("")
  const [selectedKey, setSelectedKey] = createSignal<string | undefined>(
    props.accounts[0] === undefined ? "add-account" : `account:${props.accounts[0].id}`,
  )

  const entries = createMemo(() =>
    buildSettingsEntries({
      accounts: props.accounts,
      mailboxes: props.mailboxes,
      sync: props.sync,
    }),
  )
  const filtered = createMemo(() => filterSettingsEntries(entries(), query()))
  const groups = createMemo(() => groupSettingsEntries(filtered()))
  const selectedEntry = createMemo(() => filtered().find((entry) => entry.key === selectedKey()))

  createEffect(() => {
    const rows = filtered()
    const current = selectedKey()
    if (current !== undefined && rows.some((entry) => entry.key === current)) {
      return
    }
    setSelectedKey((rows[0] ?? entries()[0])?.key)
  })

  const selectedAccount = createMemo(() => {
    const entry = selectedEntry()
    return entry?.kind === "account"
      ? props.accounts.find((account) => account.id === entry.accountId)
      : undefined
  })

  const selectedFolderEntry = createMemo(() => {
    const entry = selectedEntry()
    return entry?.kind === "folder" ? entry : undefined
  })

  const selectedMailbox = createMemo(() => {
    const entry = selectedFolderEntry()
    return entry === undefined
      ? undefined
      : props.mailboxes.find((mailbox) => mailbox.id === entry.mailboxId)
  })

  const selectedAccountLabel = createMemo(() => {
    const entry = selectedFolderEntry()
    if (entry === undefined) {
      return ""
    }
    return (
      props.accounts.find((account) => account.id === entry.accountId)?.label ?? entry.accountId
    )
  })

  const accountProfile = useAccountProfile({
    runtime,
    account: selectedAccount,
    active: () => zone() === "detail",
    onSaved: (account) => {
      setStatus(`account ${account.label} saved`)
      props.onAccountSaved(account)
    },
  })

  const syncProfile = useSyncProfile({
    runtime,
    sync: () => props.sync,
    onSaved: () => {
      setStatus("sync settings saved")
      props.onSyncSaved()
    },
  })

  const toggleMute = (mailboxId: number, name: string, muted: boolean) => {
    const program = Effect.gen(function* muteFolder() {
      yield* setMailboxMuted(mailboxId, !muted).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            setStatus(muted ? `${name} unmuted` : `${name} muted`)
            props.onMailboxChanged()
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            setStatus(`could not update the mailbox · ${describeError(error)}`)
          }),
        ),
      )
    })
    runtime.runFork(program)
  }

  const moveSelection = (delta: number) => {
    const rows = filtered()
    const index = rows.findIndex((entry) => entry.key === selectedKey())
    const clamped = Math.min(Math.max(index === -1 ? 0 : index + delta, 0), rows.length - 1)
    const next = rows[clamped]
    if (next !== undefined) {
      setSelectedKey(next.key)
    }
  }

  const activateEntry = (key: string) => {
    setSelectedKey(key)
    const entry = filtered().find((candidate) => candidate.key === key)
    if (entry === undefined) {
      return
    }
    if (entry.kind === "add-account") {
      props.onAddAccount()
      return
    }
    setZone("detail")
  }

  const handleNavKey = (event: KeyEvent): boolean => {
    if (event.name === "down") {
      event.preventDefault()
      moveSelection(1)
      return true
    }
    if (event.name === "up") {
      event.preventDefault()
      moveSelection(-1)
      return true
    }
    if (event.name === "tab" || event.name === "return") {
      event.preventDefault()
      const entry = selectedEntry()
      if (entry !== undefined && (event.name === "return" || entry.kind !== "add-account")) {
        activateEntry(entry.key)
      }
      return true
    }
    if (event.name === "escape") {
      event.preventDefault()
      if (query().length > 0) {
        setQuery("")
      } else {
        props.onClose()
      }
      return true
    }
    return false
  }

  const handleDetailKey = (event: KeyEvent): boolean => {
    if (event.name === "escape" || (event.name === "tab" && event.shift)) {
      event.preventDefault()
      setZone("nav")
      return true
    }
    const entry = selectedEntry()
    if (entry?.kind === "account") {
      if (accountProfile.handleKey(event)) {
        event.preventDefault()
      }
      return true
    }
    if (entry?.kind === "sync") {
      if (syncProfile.handleKey(event)) {
        event.preventDefault()
      }
      return true
    }
    if (entry?.kind === "folder") {
      if (event.name === "return" || event.name === "space") {
        event.preventDefault()
        toggleMute(entry.mailboxId, entry.name, entry.muted)
        return true
      }
      if (event.name === "tab") {
        event.preventDefault()
        setZone("nav")
        return true
      }
    }
    return false
  }

  useKeyboard((event) => {
    if (event.ctrl && event.name === "c") {
      event.preventDefault()
      renderer.destroy()
      return
    }
    if (zone() === "nav") {
      handleNavKey(event)
      return
    }
    handleDetailKey(event)
  })

  return (
    <box flexGrow={1} flexDirection="column">
      <box flexGrow={1} flexDirection="row" gap={1}>
        <SettingsNav
          query={query()}
          onQuery={(value) => {
            setQuery(value)
          }}
          groups={groups()}
          selectedKey={selectedKey()}
          searchFocused={zone() === "nav"}
          onSelect={(key) => {
            setSelectedKey(key)
          }}
          onActivate={activateEntry}
        />
        <SettingsDetail
          entry={selectedEntry()}
          zone={zone()}
          account={selectedAccount()}
          mailbox={selectedMailbox()}
          accountLabel={selectedAccountLabel()}
          counts={props.counts}
          accountProfile={accountProfile}
          syncProfile={syncProfile}
        />
      </box>
      <box flexShrink={0} paddingLeft={2} paddingRight={2}>
        <text fg={theme.muted} wrapMode="none" truncate>
          {status()}
        </text>
      </box>
    </box>
  )
}

export { SettingsScreen, type SettingsScreenProps }
