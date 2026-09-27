import type { KeyEvent } from "@opentui/core"
import type { ServerConfig } from "@vingroto/core/config/schema"
import type { AccountSave, NewAccount } from "@vingroto/core/protocol/accounts"

import * as Data from "effect/Data"

type Security = "tls" | "starttls" | "none"

type TextFieldId =
  | "email"
  | "label"
  | "name"
  | "username"
  | "imapHost"
  | "imapPort"
  | "smtpHost"
  | "smtpPort"
type SecurityFieldId = "imapSecurity" | "smtpSecurity"
type SecretFieldId = "password"
type BooleanFieldId = "saveSent"
type FieldId = TextFieldId | SecurityFieldId | SecretFieldId | BooleanFieldId

type FieldKind = "text" | "secret" | "security" | "boolean" | "readonly"

interface FieldDescriptor<Id extends string = FieldId> {
  readonly id: Id
  readonly label: string
  readonly kind: FieldKind
  readonly placeholder?: string
}

interface AccountDraft {
  email: string
  password: string
  label: string
  name: string
  username: string
  imapHost: string
  imapPort: string
  imapSecurity: Security
  smtpHost: string
  smtpPort: string
  smtpSecurity: Security
  saveSent: boolean
}

type ValidationResult = Data.TaggedEnum<{
  ok: { readonly value: NewAccount }
  error: { readonly message: string }
}>

const validationResult = Data.taggedEnum<ValidationResult>()

type EditValidationResult = Data.TaggedEnum<{
  ok: { readonly value: AccountSave }
  error: { readonly message: string }
}>

const editValidationResult = Data.taggedEnum<EditValidationResult>()

const credentialFields = [
  { id: "email", label: "Email", kind: "text", placeholder: "you@example.com" },
  { id: "password", label: "Password", kind: "secret" },
] as const satisfies readonly FieldDescriptor[]

const profileFields = [
  { id: "label", label: "Mailbox name", kind: "text", placeholder: "defaults to email" },
  { id: "name", label: "Sender name", kind: "text", placeholder: "optional" },
  { id: "username", label: "Username", kind: "text", placeholder: "defaults to email" },
] as const satisfies readonly FieldDescriptor[]

const connectionFields = [
  { id: "imapHost", label: "IMAP host", kind: "text", placeholder: "imap.example.com" },
  { id: "imapPort", label: "IMAP port", kind: "text", placeholder: "993" },
  { id: "imapSecurity", label: "IMAP security", kind: "security" },
  { id: "smtpHost", label: "SMTP host", kind: "text", placeholder: "smtp.example.com" },
  { id: "smtpPort", label: "SMTP port", kind: "text", placeholder: "465" },
  { id: "smtpSecurity", label: "SMTP security", kind: "security" },
] as const satisfies readonly FieldDescriptor[]

const serverFields = [
  ...profileFields,
  ...connectionFields,
] as const satisfies readonly FieldDescriptor[]

const [labelField, nameField, usernameField] = profileFields

const editFields = [
  labelField,
  nameField,
  { id: "email", label: "Email", kind: "readonly" },
  usernameField,
  { id: "password", label: "Password", kind: "secret", placeholder: "unchanged" },
  ...connectionFields,
  { id: "saveSent", label: "Save sent copy", kind: "boolean" },
] as const satisfies readonly FieldDescriptor[]

const securityOrder: readonly Security[] = ["tls", "starttls", "none"]

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

const emptyDraft = (): AccountDraft => ({
  email: "",
  password: "",
  label: "",
  name: "",
  username: "",
  imapHost: "",
  imapPort: "",
  imapSecurity: "tls",
  smtpHost: "",
  smtpPort: "",
  smtpSecurity: "tls",
  saveSent: true,
})

const isServerField = (id: FieldId) =>
  id === "imapHost" ||
  id === "imapPort" ||
  id === "imapSecurity" ||
  id === "smtpHost" ||
  id === "smtpPort" ||
  id === "smtpSecurity"

const maskSecret = (value: string) => "•".repeat(value.length)

const storedSecretMask = "*".repeat(12)

const securityLabel = (value: string) => {
  if (value === "tls") {
    return "TLS"
  }
  if (value === "starttls") {
    return "STARTTLS"
  }
  return "none"
}

const cycleSecurity = (value: Security, delta: number): Security => {
  const index = securityOrder.indexOf(value)
  const next = (index + delta + securityOrder.length) % securityOrder.length
  return securityOrder[next] ?? "tls"
}

const isPrintable = (event: KeyEvent) => {
  if (event.ctrl || event.meta || event.option || event.super === true) {
    return false
  }
  if (event.sequence.length === 0) {
    return false
  }
  for (const character of event.sequence) {
    const code = character.codePointAt(0) ?? 0
    if (code < 32 || code === 127) {
      return false
    }
  }
  return true
}

const applySecretKey = (value: string, event: KeyEvent): string | undefined => {
  if (event.ctrl && event.name === "u") {
    return ""
  }
  if (event.ctrl && event.name === "w") {
    return value.replace(/\s*\S+\s*$/u, "")
  }
  if (event.name === "backspace" || event.name === "delete") {
    return value.slice(0, -1)
  }
  if (isPrintable(event)) {
    return value + event.sequence
  }
  return undefined
}

const parsePort = (value: string): number | undefined => {
  const parsed = Math.trunc(Number(value.trim()))
  const valid = !Number.isNaN(parsed) && parsed >= 1 && parsed <= 65_535
  return valid ? parsed : undefined
}

interface Profile {
  readonly label: string
  readonly name?: string
  readonly username: string
  readonly imap: ServerConfig
  readonly smtp: ServerConfig
}

type ProfileResult = Data.TaggedEnum<{
  ok: { readonly value: Profile }
  error: { readonly message: string }
}>

const profileResult = Data.taggedEnum<ProfileResult>()

const validateProfile = (draft: AccountDraft): ProfileResult => {
  const imapPort = parsePort(draft.imapPort)
  if (draft.imapHost.trim().length === 0 || imapPort === undefined) {
    return profileResult.error({ message: "enter a valid IMAP host and port" })
  }
  const smtpPort = parsePort(draft.smtpPort)
  if (draft.smtpHost.trim().length === 0 || smtpPort === undefined) {
    return profileResult.error({ message: "enter a valid SMTP host and port" })
  }
  const email = draft.email.trim()
  const label = draft.label.trim()
  const name = draft.name.trim()
  const username = draft.username.trim().length === 0 ? email : draft.username.trim()
  return profileResult.ok({
    value: {
      label: label.length === 0 ? email : label,
      ...(name.length === 0 ? {} : { name }),
      username,
      imap: {
        host: draft.imapHost.trim(),
        port: imapPort,
        security: draft.imapSecurity,
      },
      smtp: {
        host: draft.smtpHost.trim(),
        port: smtpPort,
        security: draft.smtpSecurity,
      },
    },
  })
}

const validateDraft = (draft: AccountDraft): ValidationResult => {
  const email = draft.email.trim()
  if (!emailPattern.test(email)) {
    return validationResult.error({ message: "enter a valid email address" })
  }
  if (draft.password.length === 0) {
    return validationResult.error({ message: "enter the account password" })
  }
  const profile = validateProfile(draft)
  if (profile._tag === "error") {
    return validationResult.error({ message: profile.message })
  }
  return validationResult.ok({
    value: { email, password: draft.password, ...profile.value, saveSent: draft.saveSent },
  })
}

const validateEditDraft = (draft: AccountDraft): EditValidationResult => {
  const profile = validateProfile(draft)
  if (profile._tag === "error") {
    return editValidationResult.error({ message: profile.message })
  }
  return editValidationResult.ok({
    value: {
      ...profile.value,
      saveSent: draft.saveSent,
      ...(draft.password.length === 0 ? {} : { password: draft.password }),
    },
  })
}

export {
  applySecretKey,
  credentialFields,
  cycleSecurity,
  editFields,
  emptyDraft,
  isServerField,
  maskSecret,
  securityLabel,
  serverFields,
  storedSecretMask,
  validateDraft,
  validateEditDraft,
  type AccountDraft,
  type BooleanFieldId,
  type EditValidationResult,
  type FieldDescriptor,
  type FieldId,
  type FieldKind,
  type Profile,
  type SecretFieldId,
  type Security,
  type SecurityFieldId,
  type TextFieldId,
}
