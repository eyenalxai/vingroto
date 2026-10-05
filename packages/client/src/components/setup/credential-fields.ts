import type { AuthMethod } from "@vingroto/core/config/schema"

type CredentialFieldId = "email" | "auth" | "password" | "oauthClientId" | "oauthClientSecret"

type CredentialFieldKind = "text" | "secret" | "auth"

interface CredentialField {
  readonly id: CredentialFieldId
  readonly label: string
  readonly kind: CredentialFieldKind
  readonly placeholder?: string
}

const gmailDomains = ["@gmail.com", "@googlemail.com"] as const

const isGmailAddress = (email: string): boolean => {
  const normalized = email.trim().toLowerCase()
  return gmailDomains.some((domain) => normalized.endsWith(domain))
}

// Why: a stale oauth choice on a non-Gmail address must never turn the form into an OAuth account.
const authForDraft = (draft: { readonly email: string; readonly auth: AuthMethod }): AuthMethod =>
  isGmailAddress(draft.email) ? draft.auth : "password"

const authOrder: readonly AuthMethod[] = ["password", "oauth2"]

const cycleAuth = (value: AuthMethod, delta: number): AuthMethod => {
  const index = authOrder.indexOf(value)
  const next = (index + delta + authOrder.length) % authOrder.length
  return authOrder[next] ?? "password"
}

const authLabel = (value: string) => (value === "oauth2" ? "Google OAuth" : "Password")

const emailField = {
  id: "email",
  label: "Email",
  kind: "text",
  placeholder: "you@example.com",
} as const satisfies CredentialField

const passwordField = {
  id: "password",
  label: "Password",
  kind: "secret",
} as const satisfies CredentialField

const authField = {
  id: "auth",
  label: "Authentication",
  kind: "auth",
} as const satisfies CredentialField

const oauthClientIdField = {
  id: "oauthClientId",
  label: "Client ID",
  kind: "text",
  placeholder: "OAuth client ID from Google",
} as const satisfies CredentialField

const oauthClientSecretField = {
  id: "oauthClientSecret",
  label: "Client secret",
  kind: "secret",
} as const satisfies CredentialField

// Why: the OAuth choice only exists for Gmail addresses, so the credential fields depend on the draft.
const credentialFields = (draft: {
  readonly email: string
  readonly auth: AuthMethod
}): readonly CredentialField[] => {
  if (!isGmailAddress(draft.email)) {
    return [emailField, passwordField]
  }
  if (draft.auth === "oauth2") {
    return [emailField, authField, oauthClientIdField, oauthClientSecretField]
  }
  return [emailField, authField, passwordField]
}

export {
  authForDraft,
  authLabel,
  credentialFields,
  cycleAuth,
  isGmailAddress,
  type CredentialField,
}
