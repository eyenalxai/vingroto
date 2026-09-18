import type { KeyEvent } from "@opentui/core"

import type { NewAccount } from "@/lib/config/accounts"

import { ServerConfig } from "@/lib/config/schema"

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
type FieldId = TextFieldId | SecurityFieldId | SecretFieldId

type FieldKind = "text" | "secret" | "security"

interface FieldDescriptor {
  readonly id: FieldId
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
}

type ValidationResult =
  | { readonly _tag: "ok"; readonly value: NewAccount }
  | { readonly _tag: "error"; readonly message: string }

const credentialFields = [
  { id: "email", label: "Email", kind: "text", placeholder: "you@example.com" },
  { id: "password", label: "Password", kind: "secret" },
] as const satisfies readonly FieldDescriptor[]

const serverFields = [
  { id: "label", label: "Mailbox name", kind: "text", placeholder: "defaults to email" },
  { id: "name", label: "Sender name", kind: "text", placeholder: "optional" },
  { id: "username", label: "Username", kind: "text", placeholder: "defaults to email" },
  { id: "imapHost", label: "IMAP host", kind: "text", placeholder: "imap.example.com" },
  { id: "imapPort", label: "IMAP port", kind: "text", placeholder: "993" },
  { id: "imapSecurity", label: "IMAP security", kind: "security" },
  { id: "smtpHost", label: "SMTP host", kind: "text", placeholder: "smtp.example.com" },
  { id: "smtpPort", label: "SMTP port", kind: "text", placeholder: "465" },
  { id: "smtpSecurity", label: "SMTP security", kind: "security" },
] as const satisfies readonly FieldDescriptor[]

const securityOrder: readonly Security[] = ["tls", "starttls", "none"]

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

const emptyDraft = (): AccountDraft => {
  return {
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
  }
}

const isServerField = (id: FieldId) =>
  id === "imapHost" ||
  id === "imapPort" ||
  id === "imapSecurity" ||
  id === "smtpHost" ||
  id === "smtpPort" ||
  id === "smtpSecurity"

const maskSecret = (value: string) => "•".repeat(value.length)

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

const validateDraft = (draft: AccountDraft): ValidationResult => {
  const email = draft.email.trim()
  if (!emailPattern.test(email)) {
    return { _tag: "error", message: "enter a valid email address" }
  }
  if (draft.password.length === 0) {
    return { _tag: "error", message: "enter the account password" }
  }
  const imapPort = parsePort(draft.imapPort)
  if (draft.imapHost.trim().length === 0 || imapPort === undefined) {
    return { _tag: "error", message: "enter a valid IMAP host and port" }
  }
  const smtpPort = parsePort(draft.smtpPort)
  if (draft.smtpHost.trim().length === 0 || smtpPort === undefined) {
    return { _tag: "error", message: "enter a valid SMTP host and port" }
  }
  const label = draft.label.trim()
  const name = draft.name.trim()
  const username = draft.username.trim().length === 0 ? email : draft.username.trim()
  return {
    _tag: "ok",
    value: {
      email,
      label: label.length === 0 ? email : label,
      name: name.length === 0 ? undefined : name,
      username,
      password: draft.password,
      imap: new ServerConfig({
        host: draft.imapHost.trim(),
        port: imapPort,
        security: draft.imapSecurity,
      }),
      smtp: new ServerConfig({
        host: draft.smtpHost.trim(),
        port: smtpPort,
        security: draft.smtpSecurity,
      }),
    },
  }
}

export {
  applySecretKey,
  credentialFields,
  cycleSecurity,
  emptyDraft,
  isServerField,
  maskSecret,
  securityLabel,
  serverFields,
  validateDraft,
  type AccountDraft,
  type FieldDescriptor,
  type FieldId,
  type FieldKind,
  type SecretFieldId,
  type Security,
  type SecurityFieldId,
  type TextFieldId,
}
