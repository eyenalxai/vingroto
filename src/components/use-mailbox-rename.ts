import { Effect } from "effect"
import { createSignal } from "solid-js"

import type { AppRuntime } from "@/lib/runtime"

import { renameAccount } from "@/lib/config/accounts"
import { describeError } from "@/lib/errors"

interface MailboxRenameTarget {
  readonly id: string
  readonly label: string
}

interface MailboxRenameOptions {
  readonly runtime: AppRuntime
  readonly onStatus: (message: string) => void
  readonly onRenamed: () => Promise<unknown>
}

const useMailboxRename = (options: MailboxRenameOptions) => {
  const [target, setTarget] = createSignal<MailboxRenameTarget | undefined>()
  const [errorMessage, setErrorMessage] = createSignal("")

  const begin = (account: MailboxRenameTarget) => {
    setErrorMessage("")
    setTarget({ id: account.id, label: account.label })
  }

  const cancel = () => {
    setErrorMessage("")
    setTarget(undefined)
  }

  const submit = (label: string) => {
    const current = target()
    if (current === undefined) {
      return
    }
    if (label === current.label) {
      cancel()
      return
    }
    const program = Effect.gen(function* persistRename() {
      yield* renameAccount(current.id, label).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            setErrorMessage("")
            setTarget(undefined)
          }),
        ),
        Effect.tap(() => Effect.promise(options.onRenamed)),
        Effect.tap(() =>
          Effect.sync(() => {
            options.onStatus(`mailbox renamed to ${label}`)
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            setErrorMessage(describeError(error))
          }),
        ),
      )
    })
    options.runtime.runFork(program)
  }

  return { begin, cancel, error: errorMessage, submit, target }
}

export { useMailboxRename, type MailboxRenameOptions, type MailboxRenameTarget }
