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

const truncate = (value: string, length: number): string => {
  if (value.length <= length) {
    return value
  }
  return `${value.slice(0, Math.max(1, length - 1))}…`
}

const senderLabel = (fromName: string | null, fromAddress: string | null): string =>
  fromName ?? fromAddress ?? "(unknown sender)"

export { formatMessageDate, senderLabel, truncate }
