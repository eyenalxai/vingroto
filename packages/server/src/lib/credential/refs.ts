import type { AccountId } from "@vingroto/core/ids"

const usernameReference = (accountId: AccountId) => `account:${accountId}:username`

const passwordReference = (accountId: AccountId) => `account:${accountId}:password`

const oauthClientSecretReference = (accountId: AccountId) =>
  `account:${accountId}:oauth-client-secret`

const oauthRefreshTokenReference = (accountId: AccountId) =>
  `account:${accountId}:oauth-refresh-token`

export {
  oauthClientSecretReference,
  oauthRefreshTokenReference,
  passwordReference,
  usernameReference,
}
