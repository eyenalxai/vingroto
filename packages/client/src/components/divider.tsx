import { useTheme } from "@/components/theme-provider"

const Divider = () => {
  const theme = useTheme()
  return <box height={1} flexShrink={0} border={["bottom"]} borderColor={theme.border} />
}

export { Divider }
