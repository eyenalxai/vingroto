import type { AccountId } from "@vingroto/core/ids"

const usernameReference = (accountId: AccountId) => `account:${accountId}:username`

const passwordReference = (accountId: AccountId) => `account:${accountId}:password`

export { passwordReference, usernameReference }
