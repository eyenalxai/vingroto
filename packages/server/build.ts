import path from "node:path"

const result = await Bun.build({
  entrypoints: [path.join(import.meta.dirname, "src/server.ts")],
  target: "bun",
  // Why: dbus-next requires the optional x11 package inside a fallback that only runs when no session bus address is discoverable.
  external: ["x11"],
  compile: {
    outfile: path.join(import.meta.dirname, "dist/vingroto-server"),
    assets: [
      path.join(import.meta.dirname, "drizzle"),
      path.join(import.meta.dirname, "../../package.json"),
    ],
    autoloadBunfig: false,
    autoloadDotenv: false,
  },
})

if (!result.success) {
  for (const log of result.logs) {
    process.stderr.write(`${log.message}\n`)
  }
  process.exit(1)
}
