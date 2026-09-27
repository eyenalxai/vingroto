import { Effect, Fiber } from "effect"
import { Show, createSignal, onCleanup, onMount } from "solid-js"

import type { AppRuntime, AppRuntimeError } from "@/lib/runtime"

import { useRuntime } from "@/components/runtime-provider"
import { useTheme } from "@/components/theme-provider"

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const frameIntervalMs = 80

const [frameIndex, setFrameIndex] = createSignal(0)
let frameFiber: Fiber.Fiber<void, AppRuntimeError> | null = null
let frameSubscribers = 0

const advanceFrame = () => {
  setFrameIndex((index) => (index + 1) % frames.length)
}

const frameClock = Effect.sleep(frameIntervalMs).pipe(
  Effect.andThen(Effect.sync(advanceFrame)),
  Effect.forever,
)

const acquireFrameClock = (runtime: AppRuntime) => {
  frameSubscribers += 1
  frameFiber ??= runtime.runFork(frameClock)
}

const releaseFrameClock = (runtime: AppRuntime) => {
  frameSubscribers -= 1
  if (frameSubscribers === 0 && frameFiber !== null) {
    runtime.runFork(Fiber.interrupt(frameFiber))
    frameFiber = null
  }
}

interface SpinnerProps {
  readonly label?: string
  readonly color?: string
}

// One shared clock drives every spinner so a long list of pending rows never schedules a timer per row.
const Spinner = (props: SpinnerProps) => {
  const runtime = useRuntime()
  const theme = useTheme()
  const color = () => props.color ?? theme.muted
  onMount(() => {
    acquireFrameClock(runtime)
  })
  onCleanup(() => {
    releaseFrameClock(runtime)
  })
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
