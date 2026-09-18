import type { MailAddress } from "@/lib/mail/address"

const padNumber = (value: number) => value.toString().padStart(2, "0")

const formatMessageDate = (timestamp: number | null): string => {
  if (timestamp === null) {
    return "--:--"
  }
  const date = new Date(timestamp)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`
  }
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`
}

const formatMessageDateTime = (timestamp: number | null): string => {
  if (timestamp === null) {
    return "unknown date"
  }
  const date = new Date(timestamp)
  const day = `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`
  return `${day} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

const formatBytes = (size: number | null): string => {
  if (size === null) {
    return "unknown size"
  }
  if (size < 1024) {
    return `${size} B`
  }
  const kilobytes = size / 1024
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} kB`
  }
  const megabytes = kilobytes / 1024
  if (megabytes < 1024) {
    return `${megabytes.toFixed(1)} MB`
  }
  return `${(megabytes / 1024).toFixed(1)} GB`
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

const snippetLength = 200

const toSnippet = (text: string | null): string | null => {
  if (text === null) {
    return null
  }
  const compact = text.replaceAll(/\s+/gu, " ").trim()
  if (compact.length === 0) {
    return null
  }
  return compact.slice(0, snippetLength)
}

const senderLabel = (fromName: string | null, fromAddress: string | null): string =>
  fromName ?? fromAddress ?? "(unknown sender)"

export {
  addressLabel,
  addressList,
  formatBytes,
  formatMessageDate,
  formatMessageDateTime,
  senderLabel,
  toSnippet,
  truncate,
}
