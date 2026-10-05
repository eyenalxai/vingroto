import type { AuthMethod } from "@vingroto/core/config/schema"

type CredentialFieldId = "email" | "auth" | "password" | "oauthClientId" | "oauthClientSecret"

type CredentialFieldKind = "text" | "secret" | "auth"

interface CredentialField {
  readonly id: CredentialFieldId
  readonly label: string
  readonly kind: CredentialFieldKind
  readonly placeholder?: string
}

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

// Why: Google OAuth is offered for every address; only the user knows whether their account is Google-hosted.
const credentialFields = (draft: { readonly auth: AuthMethod }): readonly CredentialField[] => {
  if (draft.auth === "oauth2") {
    return [emailField, authField, oauthClientIdField, oauthClientSecretField]
  }
  return [emailField, authField, passwordField]
}

export { authLabel, credentialFields, cycleAuth, type CredentialField }
