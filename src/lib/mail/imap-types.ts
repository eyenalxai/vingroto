import * as Schema from "effect/Schema"

import type { CredentialError } from "@/lib/credential/service"
import type { MailAddress } from "@/lib/mail/address"

interface MailboxInfo {
  readonly path: string
  readonly name: string
  readonly delimiter: string
  readonly specialUse: string | undefined
  readonly selectable: boolean
}

interface MailboxWindowRequest {
  readonly path: string
  readonly since: Date | undefined
  readonly fromUid: number | undefined
}

interface MessageEnvelope {
  readonly uid: number
  readonly messageId: string | undefined
  readonly inReplyTo: string | undefined
  readonly subject: string | undefined
  readonly from: readonly MailAddress[]
  readonly to: readonly MailAddress[]
  readonly cc: readonly MailAddress[]
  readonly date: number | undefined
  readonly size: number | undefined
  readonly seen: boolean
  readonly answered: boolean
  readonly flagged: boolean
  readonly draft: boolean
  readonly keywords: readonly string[]
}

interface MailboxSnapshot {
  readonly path: string
  readonly uidValidity: number
  readonly exists: number
  readonly messages: readonly MessageEnvelope[]
}

class ImapError extends Schema.TaggedError<ImapError>()("ImapError", {
  accountId: Schema.String,
  operation: Schema.String,
  message: Schema.String,
}) {}

type ImapServiceError = ImapError | CredentialError

type MailboxWindowResult =
  | { readonly _tag: "ok"; readonly path: string; readonly snapshot: MailboxSnapshot }
  | { readonly _tag: "error"; readonly path: string; readonly message: string }

interface MessageSourceRequest {
  readonly mailboxPath: string
  readonly uid: number
}

type MessageSourceResult =
  | {
      readonly _tag: "ok"
      readonly mailboxPath: string
      readonly uid: number
      readonly source: Buffer
    }
  | {
      readonly _tag: "error"
      readonly mailboxPath: string
      readonly uid: number
      readonly message: string
    }

export {
  ImapError,
  type ImapServiceError,
  type MailboxInfo,
  type MailboxSnapshot,
  type MailboxWindowRequest,
  type MailboxWindowResult,
  type MessageEnvelope,
  type MessageSourceRequest,
  type MessageSourceResult,
}
