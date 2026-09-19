import type { AccountConfig } from "@vingroto/core/config/schema"

import { Effect } from "effect"

import type { AppRuntime } from "@/lib/runtime"

interface SettingsActionsOptions {
  readonly runtime: AppRuntime
  readonly refresh: () => Promise<void>
  readonly onRefreshed: () => void
  readonly onStatus: (message: string) => void
  readonly onAccountAdded: () => void
  readonly syncWindow: () => void
}

const createSettingsActions = (options: SettingsActionsOptions) => {
  const refreshConfig = async () => {
    await options.refresh()
    options.onRefreshed()
  }

  const refreshWithStatus = (message: string) => {
    options.onStatus(message)
    options.runtime.runFork(Effect.promise(refreshConfig))
  }

  const handleAccountSaved = (account: AccountConfig) => {
    options.onAccountAdded()
    options.onStatus(`account ${account.label} saved · syncing`)
    options.runtime.runFork(
      Effect.promise(options.refresh).pipe(Effect.andThen(Effect.sync(options.syncWindow))),
    )
  }

  return {
    handleAccountSaved,
    handleAccountUpdated: (account: AccountConfig) => {
      refreshWithStatus(`account ${account.label} updated`)
    },
    handleEditorSaved: () => {
      refreshWithStatus("editor setting saved")
    },
    handleNotificationsSaved: () => {
      refreshWithStatus("notification settings saved")
    },
    handleSendSaved: () => {
      refreshWithStatus("sending settings saved")
    },
    handleSyncSaved: () => {
      refreshWithStatus("sync settings saved")
    },
  }
}

export { createSettingsActions, type SettingsActionsOptions }
