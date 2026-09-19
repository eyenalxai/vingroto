import type { MailAddress } from "@vingroto/core/mail/address"

import * as Data from "effect/Data"

type AddressListResult = Data.TaggedEnum<{
  ok: { readonly addresses: readonly MailAddress[] }
  error: { readonly message: string }
}>

const addressList = Data.taggedEnum<AddressListResult>()

const emailPattern = /^[^\s@,;<>]+@[^\s@,;<>]+$/u

const splitEntries = (value: string): readonly string[] => {
  const entries: string[] = []
  let current = ""
  let quoted = false
  let angled = false
  for (const character of value) {
    if (character === '"') {
      quoted = !quoted
      current += character
      continue
    }
    if (!quoted && character === "<") {
      angled = true
      current += character
      continue
    }
    if (!quoted && character === ">") {
      angled = false
      current += character
      continue
    }
    if (!quoted && !angled && (character === "," || character === ";")) {
      entries.push(current)
      current = ""
      continue
    }
    current += character
  }
  entries.push(current)
  return entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
}

const unquote = (value: string): string => {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).trim()
  }
  return value
}

const parseAddress = (entry: string): MailAddress | undefined => {
  const angled = /^(?<name>.*?)\s*<(?<address>[^<>]*)>$/u.exec(entry)
  const address = (angled?.groups?.address ?? entry).trim()
  if (!emailPattern.test(address)) {
    return undefined
  }
  const rawName = angled?.groups?.name === undefined ? "" : unquote(angled.groups.name.trim())
  return rawName.length === 0 ? { address } : { name: rawName, address }
}

const parseAddressList = (value: string): AddressListResult => {
  const addresses: MailAddress[] = []
  for (const entry of splitEntries(value)) {
    const parsed = parseAddress(entry)
    if (parsed === undefined) {
      return addressList.error({ message: `${entry} is not a valid email address` })
    }
    addresses.push(parsed)
  }
  return addressList.ok({ addresses })
}

const formatAddress = (address: MailAddress): string => {
  const name = address.name?.trim() ?? ""
  return name.length === 0 ? address.address : `${name} <${address.address}>`
}

const formatAddressList = (addresses: readonly MailAddress[]): string =>
  addresses.map((address) => formatAddress(address)).join(", ")

const addressKey = (address: MailAddress): string => address.address.trim().toLowerCase()

export { addressKey, formatAddress, formatAddressList, parseAddressList, type AddressListResult }
