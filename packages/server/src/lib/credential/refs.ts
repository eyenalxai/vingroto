const usernameReference = (accountId: string) => `account:${accountId}:username`

const passwordReference = (accountId: string) => `account:${accountId}:password`

export { passwordReference, usernameReference }
