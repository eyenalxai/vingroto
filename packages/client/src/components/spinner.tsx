import { Show, createSignal, onCleanup, onMount } from "solid-js"

import { useTheme } from "@/components/theme-provider"

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const frameIntervalMs = 80

const [frameIndex, setFrameIndex] = createSignal(0)
let frameTimer: ReturnType<typeof setInterval> | null = null
let frameSubscribers = 0

const acquireFrameClock = () => {
  frameSubscribers += 1
  frameTimer ??= setInterval(() => {
    setFrameIndex((index) => (index + 1) % frames.length)
  }, frameIntervalMs)
}

const releaseFrameClock = () => {
  frameSubscribers -= 1
  if (frameSubscribers === 0 && frameTimer !== null) {
    clearInterval(frameTimer)
    frameTimer = null
  }
}

interface SpinnerProps {
  readonly label?: string
  readonly color?: string
}

// One shared clock drives every spinner so a long list of pending rows never schedules a timer per row.
const Spinner = (props: SpinnerProps) => {
  const theme = useTheme()
  const color = () => props.color ?? theme.muted
  onMount(acquireFrameClock)
  onCleanup(releaseFrameClock)
  return (
    <box flexDirection="row" gap={1} flexShrink={0}>
      <text fg={color()}>{frames[frameIndex()] ?? frames[0]}</text>
      <Show when={props.label !== undefined && props.label.length > 0}>
        <text fg={color()} wrapMode="none" truncate>
          {props.label}
        </text>
      </Show>
    </box>
  )
}

export { Spinner, type SpinnerProps }
