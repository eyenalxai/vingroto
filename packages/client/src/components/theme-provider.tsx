import type { TerminalColors, ThemeMode } from "@opentui/core"
import type { JSX } from "@opentui/solid"

import { CliRenderEvents } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { createContext, createMemo, createSignal, onCleanup, onMount, useContext } from "solid-js"

import type { Theme } from "@/lib/theme"

import { useRuntime } from "@/components/runtime-provider"
import { resolveTheme, themeModeOf } from "@/lib/theme"

class ThemePaletteError extends Schema.TaggedError<ThemePaletteError>()("ThemePaletteError", {
  message: Schema.String,
}) {}

const ThemeContext = createContext<() => Theme>()

const paletteQueryTimeoutMs = 1500

const ThemeProvider = (props: {
  readonly children: JSX.Element
  readonly initialColors?: TerminalColors | null
  readonly initialMode?: ThemeMode
}) => {
  const renderer = useRenderer()
  const runtime = useRuntime()
  const [mode, setMode] = createSignal<ThemeMode>(props.initialMode ?? renderer.themeMode ?? "dark")
  const [colors, setColors] = createSignal<TerminalColors | undefined>(
    props.initialColors === null ? undefined : props.initialColors,
  )

  const theme = createMemo(() => resolveTheme(colors(), mode()))

  const applyPalette = (next: TerminalColors) => {
    setColors(next)
    const detected = themeModeOf(next)
    if (detected !== undefined) {
      setMode(detected)
    }
  }

  const refreshPalette = () => {
    renderer.clearPaletteCache()
    const program = Effect.tryPromise({
      try: () => renderer.getPalette({ size: 16, timeout: paletteQueryTimeoutMs }),
      catch: (cause) => new ThemePaletteError({ message: describeError(cause) }),
    }).pipe(
      Effect.tap((palette) =>
        Effect.sync(() => {
          applyPalette(palette)
        }),
      ),
      Effect.tapError((error) =>
        Effect.logWarning("could not read the terminal palette").pipe(
          Effect.annotateLogs({ reason: error.message }),
        ),
      ),
      Effect.ignore,
    )
    runtime.runFork(program)
  }

  onMount(() => {
    const handlePalette = (next: TerminalColors) => {
      applyPalette(next)
    }
    const handleMode = (next: ThemeMode) => {
      setMode(next)
    }
    renderer.on(CliRenderEvents.PALETTE, handlePalette)
    renderer.on(CliRenderEvents.THEME_MODE, handleMode)
    refreshPalette()
    onCleanup(() => {
      renderer.off(CliRenderEvents.PALETTE, handlePalette)
      renderer.off(CliRenderEvents.THEME_MODE, handleMode)
    })
  })

  return <ThemeContext.Provider value={theme}>{props.children}</ThemeContext.Provider>
}

const useTheme = (): Theme => {
  const source = useContext(ThemeContext)
  if (source === undefined) {
    throw new Error("useTheme must be used inside ThemeProvider")
  }
  return {
    get accent() {
      return source().accent
    },
    get border() {
      return source().border
    },
    get text() {
      return source().text
    },
    get muted() {
      return source().muted
    },
    get selectionBackground() {
      return source().selectionBackground
    },
    get selectionForeground() {
      return source().selectionForeground
    },
    get unread() {
      return source().unread
    },
    get error() {
      return source().error
    },
  }
}

export { ThemeProvider, useTheme }
