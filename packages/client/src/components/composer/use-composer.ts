import type { AccountConfig } from "@vingroto/core/config/schema"
import type { DraftId } from "@vingroto/core/ids"
import type { Setter } from "solid-js"

import { Effect } from "effect"
import { createMemo, createSignal } from "solid-js"

import type { PersistOutcome, RecipientParse } from "@/components/composer/composer-draft"
import type { ComposerField, ComposerTexts } from "@/components/composer/composer-fields"
import type { MailClientError } from "@/lib/api"
import type { ComposerSeed } from "@/lib/mail/compose"
import type { AppRuntime } from "@/lib/runtime"

import {
  enqueueMessage,
  parseRecipients,
  saveDraft,
  validateRecipients,
} from "@/components/composer/composer-draft"
import {
  composerFields,
  describeAccount,
  initialFromIndex,
} from "@/components/composer/composer-fields"
import { useComposerEditor } from "@/components/composer/use-composer-editor"
import { useDraftAutosave } from "@/components/composer/use-draft-autosave"
import { reportClientFailure } from "@/lib/failure"

interface ComposerOptions {
  readonly runtime: AppRuntime
  readonly accounts: readonly AccountConfig[]
  readonly seed: ComposerSeed
  readonly sendDelaySeconds: number
  readonly onClose: () => void
  readonly onDisconnected: (message: string) => void
}

const useComposer = (options: ComposerOptions) => {
  const [field, setField] = createSignal<ComposerField>("to")
  const [fromIndex, setFromIndex] = createSignal(
    initialFromIndex(options.accounts, options.seed.accountId),
  )
  const [toText, setToText] = createSignal(options.seed.to)
  const [ccText, setCcText] = createSignal(options.seed.cc)
  const [bccText, setBccText] = createSignal(options.seed.bcc)
  const [subject, setSubject] = createSignal(options.seed.subject)
  const [body, setBody] = createSignal(options.seed.body)
  const [status, setStatus] = createSignal("")
  const [statusError, setStatusError] = createSignal(false)
  const [invalidFields, setInvalidFields] = createSignal<ReadonlySet<ComposerField>>(new Set())
  const [draftId, setDraftId] = createSignal<DraftId | undefined>(options.seed.draftId)
  const [queued, setQueued] = createSignal(false)

  const fromAccount = createMemo(() => options.accounts[fromIndex()])

  const fromLabel = createMemo(() => describeAccount(fromAccount()))

  const report = (message: string, error = false) => {
    setStatus(message)
    setStatusError(error)
  }

  const reportFailure = (label: string, error: MailClientError) => {
    reportClientFailure(label, error, {
      onDisconnected: options.onDisconnected,
      onStatus: (message) => {
        report(message, true)
      },
    })
  }

  const editor = useComposerEditor({
    body,
    report,
    runtime: options.runtime,
    setBody,
    setField,
  })

  const bodyText = () => editor.textarea()?.plainText ?? body()

  const texts = (): ComposerTexts => {
    return {
      to: toText(),
      cc: ccText(),
      bcc: bccText(),
      subject: subject(),
      body: bodyText(),
    }
  }

  const recipients = (): RecipientParse => parseRecipients(texts())

  const applyOutcome = (outcome: PersistOutcome) => {
    setDraftId(outcome._tag === "saved" ? outcome.draftId : undefined)
    if (statusError()) {
      report("")
    }
  }

  const autosave = useDraftAutosave({
    account: fromAccount,
    draftId,
    onFailure: reportFailure,
    onSaved: applyOutcome,
    recipients,
    runtime: options.runtime,
    seed: options.seed,
    texts,
  })

  const edited = () => {
    setQueued(false)
    autosave.schedule()
  }

  const recipientInput = (setter: Setter<string>) => (value: string) => {
    setInvalidFields(new Set<ComposerField>())
    setter(value)
    edited()
  }

  const inputTo = recipientInput(setToText)

  const inputCc = recipientInput(setCcText)

  const inputBcc = recipientInput(setBccText)

  const inputSubject = (value: string) => {
    setSubject(value)
    edited()
  }

  const inputBody = (value: string) => {
    if (value === body()) {
      return
    }
    setBody(value)
    edited()
  }

  const cycleFrom = (delta: number) => {
    const count = options.accounts.length
    if (count === 0) {
      return
    }
    setFromIndex((current) => (current + delta + count) % count)
    edited()
  }

  const moveFocus = (delta: number) => {
    const count = composerFields.length
    setField((current) => {
      const index = composerFields.indexOf(current)
      return composerFields[(index + delta + count) % count] ?? "to"
    })
  }

  const requireRecipients = (): Extract<RecipientParse, { _tag: "ok" }> | undefined => {
    const validation = validateRecipients(texts())
    if (validation._tag === "invalid") {
      setInvalidFields(new Set<ComposerField>([validation.field]))
      report(`${validation.field} · ${validation.message}`, true)
      return undefined
    }
    setInvalidFields(new Set<ComposerField>())
    return validation.recipients
  }

  const enqueue = () => {
    if (queued()) {
      report("already queued · edit the message to queue another one")
      return
    }
    const account = fromAccount()
    if (account === undefined) {
      report("no account is configured", true)
      return
    }
    const parsed = requireRecipients()
    if (parsed === undefined) {
      return
    }
    setBody(bodyText())
    autosave.cancel()
    report("queuing…")
    const program = Effect.gen(function* queueComposerMessage() {
      yield* Effect.gen(function* runQueueComposerMessage() {
        const entry = yield* enqueueMessage({
          account,
          texts: texts(),
          recipients: parsed,
          seed: options.seed,
          draftId: draftId(),
        })
        yield* Effect.sync(() => {
          setDraftId(undefined)
          setQueued(true)
          const seconds = Math.max(0, Math.round((entry.sendAt - Date.now()) / 1000))
          report(
            options.sendDelaySeconds === 0 || seconds === 0
              ? "queued · sending now"
              : `queued · sends in ${seconds}s`,
          )
        })
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            autosave.schedule()
            reportFailure("could not queue the message", error)
          }),
        ),
      )
    })
    options.runtime.runFork(program)
  }

  const close = () => {
    autosave.cancel()
    if (queued()) {
      options.onClose()
      return
    }
    const program = Effect.gen(function* flushComposerDraft() {
      yield* Effect.gen(function* runFlushComposerDraft() {
        const account = fromAccount()
        if (account === undefined) {
          options.onClose()
          return
        }
        const parsed = recipients()
        if (parsed._tag === "error") {
          report(`${parsed.field} · ${parsed.message}`, true)
          return
        }
        yield* saveDraft({
          account,
          texts: texts(),
          recipients: parsed,
          seed: options.seed,
          draftId: draftId(),
        })
        yield* Effect.sync(() => {
          options.onClose()
        })
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            reportFailure("could not save the draft", error)
          }),
        ),
      )
    })
    options.runtime.runFork(program)
  }

  return {
    bccText,
    body,
    ccText,
    close,
    cycleFrom,
    draftId,
    editExternally: editor.editExternally,
    editing: editor.editing,
    enqueue,
    field,
    fromAccount,
    fromLabel,
    inputBcc,
    inputBody,
    inputCc,
    inputSubject,
    inputTo,
    invalidFields,
    moveFocus,
    queued,
    setTextarea: editor.setTextarea,
    status,
    statusError,
    subject,
    textarea: editor.textarea,
    toText,
  }
}

export { useComposer, type ComposerOptions }
