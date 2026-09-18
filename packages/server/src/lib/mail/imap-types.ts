import type { MailAddress } from "@vingroto/core/mail/address"
import type * as DateTime from "effect/DateTime"

import * as Data from "effect/Data"
import * as Schema from "effect/Schema"

import type { CredentialError } from "@/lib/credential/service"

type FlagMode = "add" | "remove"

interface MailboxInfo {
  readonly path: string
  readonly name: string
  readonly delimiter: string
  readonly specialUse: string | undefined
  readonly selectable: boolean
}

interface MailboxWindowRequest {
  readonly path: string
  readonly since: DateTime.Utc | undefined
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

type MailboxWindowResult = Data.TaggedEnum<{
  ok: { readonly path: string; readonly snapshot: MailboxSnapshot }
  error: { readonly path: string; readonly message: string }
}>

const mailboxWindowResult = Data.taggedEnum<MailboxWindowResult>()

type MessageSourceResult = Data.TaggedEnum<{
  ok: {
    readonly mailboxPath: string
    readonly uid: number
    readonly source: Buffer
  }
  error: {
    readonly mailboxPath: string
    readonly uid: number
    readonly message: string
  }
}>

const messageSourceResult = Data.taggedEnum<MessageSourceResult>()

interface MessageSourceRequest {
  readonly mailboxPath: string
  readonly uid: number
}

export {
  ImapError,
  mailboxWindowResult,
  messageSourceResult,
  type FlagMode,
  type ImapServiceError,
  type MailboxInfo,
  type MailboxSnapshot,
  type MailboxWindowRequest,
  type MailboxWindowResult,
  type MessageEnvelope,
  type MessageSourceRequest,
  type MessageSourceResult,
}
