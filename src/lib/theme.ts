import type { TerminalColors, ThemeMode } from "@opentui/core"

import { RGBA, parseColor, rgbToHex } from "@opentui/core"

interface Theme {
  readonly accent: string
  readonly border: string
  readonly text: string
  readonly muted: string
  readonly selectionBackground: string
  readonly selectionForeground: string
  readonly unread: string
  readonly error: string
}

const darkTheme: Theme = {
  accent: "#7aa2f7",
  border: "#3b4261",
  text: "#c0caf5",
  muted: "#6c6c6c",
  selectionBackground: "#7aa2f7",
  selectionForeground: "#1a1b26",
  unread: "#e0af68",
  error: "#f7768e",
}

const lightTheme: Theme = {
  accent: "#2e7de9",
  border: "#a8aecb",
  text: "#3760bf",
  muted: "#848cb5",
  selectionBackground: "#2e7de9",
  selectionForeground: "#ffffff",
  unread: "#b15c00",
  error: "#f52a65",
}

const luminance = (color: RGBA) => 0.299 * color.r + 0.587 * color.g + 0.114 * color.b

const mix = (from: RGBA, to: RGBA, amount: number) =>
  RGBA.fromValues(
    from.r + (to.r - from.r) * amount,
    from.g + (to.g - from.g) * amount,
    from.b + (to.b - from.b) * amount,
  )

const contrastingText = (color: RGBA) => (luminance(color) > 0.25 ? "#1a1b26" : "#ffffff")

const fallbackTheme = (mode: ThemeMode) => (mode === "dark" ? darkTheme : lightTheme)

const themeModeOf = (colors: TerminalColors): ThemeMode | undefined => {
  const background = colors.defaultBackground ?? colors.palette[0]
  return background === null || background === undefined
    ? undefined
    : luminance(parseColor(background)) > 0.5
      ? "light"
      : "dark"
}

const themeFromPalette = (colors: TerminalColors, mode: ThemeMode): Theme => {
  const fallback = fallbackTheme(mode)
  const background = colors.defaultBackground ?? colors.palette[0]
  const foreground = colors.defaultForeground ?? colors.palette[7]
  if (
    background === null ||
    background === undefined ||
    foreground === null ||
    foreground === undefined
  ) {
    return fallback
  }
  const backgroundRgba = parseColor(background)
  const foregroundRgba = parseColor(foreground)
  const accent = colors.palette[4] ?? colors.palette[6] ?? fallback.accent
  return {
    accent,
    border: rgbToHex(mix(foregroundRgba, backgroundRgba, 0.7)),
    text: rgbToHex(foregroundRgba),
    muted: rgbToHex(mix(foregroundRgba, backgroundRgba, 0.45)),
    selectionBackground: accent,
    selectionForeground: contrastingText(parseColor(accent)),
    unread: colors.palette[3] ?? fallback.unread,
    error: colors.palette[1] ?? fallback.error,
  }
}

const resolveTheme = (colors: TerminalColors | undefined, mode: ThemeMode): Theme =>
  colors === undefined ? fallbackTheme(mode) : themeFromPalette(colors, mode)

export { resolveTheme, themeModeOf, type Theme }
