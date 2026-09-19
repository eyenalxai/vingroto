type SettingsLayout = "two" | "single"

const settingsSinglePaneWidth = 64
const settingsSectionsPaneWidth = 24

const resolveSettingsLayout = (width: number): SettingsLayout =>
  width < settingsSinglePaneWidth ? "single" : "two"

export { resolveSettingsLayout, settingsSectionsPaneWidth, type SettingsLayout }
