import type { MailAddress } from "@vingroto/core/mail/address"

import * as DateTime from "effect/DateTime"

const padNumber = (value: number) => value.toString().padStart(2, "0")

// Why: timestamps are epoch millis, but the list shows wall-clock time in the user's zone like Date did before.
const localZone = DateTime.zoneMakeLocal()

const partsAt = (value: DateTime.DateTime) => DateTime.toParts(DateTime.setZone(value, localZone))

const localParts = (timestamp: number) => partsAt(DateTime.makeUnsafe(timestamp))

const formatMessageDate = (timestamp: number | null): string => {
  if (timestamp === null) {
    return "--:--"
  }
  const date = localParts(timestamp)
  const now = partsAt(DateTime.nowUnsafe())
  const sameDay = date.year === now.year && date.month === now.month && date.day === now.day
  if (sameDay) {
    return `${padNumber(date.hour)}:${padNumber(date.minute)}`
  }
  if (date.year === now.year) {
    return `${padNumber(date.month)}-${padNumber(date.day)}`
  }
  return `${date.year}-${padNumber(date.month)}-${padNumber(date.day)}`
}

const formatMessageDateTime = (timestamp: number | null): string => {
  if (timestamp === null) {
    return "unknown date"
  }
  const date = localParts(timestamp)
  return `${date.year}-${padNumber(date.month)}-${padNumber(date.day)} ${padNumber(date.hour)}:${padNumber(date.minute)}`
}

const addressLabel = (address: MailAddress): string => {
  if (address.name === undefined || address.name.length === 0) {
    return address.address
  }
  return `${address.name} <${address.address}>`
}

const addressList = (addresses: readonly MailAddress[] | null | undefined): string => {
  if (addresses === null || addresses === undefined || addresses.length === 0) {
    return "(none)"
  }
  return addresses.map((entry) => addressLabel(entry)).join(", ")
}

const truncate = (value: string, length: number): string => {
  if (value.length <= length) {
    return value
  }
  return `${value.slice(0, Math.max(1, length - 1))}…`
}

const senderLabel = (fromName: string | null, fromAddress: string | null): string => {
  if (fromName !== null && fromName.trim().length > 0) {
    return fromName
  }
  if (fromAddress !== null && fromAddress.trim().length > 0) {
    return fromAddress
  }
  return "(unknown sender)"
}

export {
  addressLabel,
  addressList,
  formatMessageDate,
  formatMessageDateTime,
  senderLabel,
  truncate,
}
