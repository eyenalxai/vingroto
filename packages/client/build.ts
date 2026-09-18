import solidPlugin from "@opentui/solid/bun-plugin"
import path from "node:path"

const libc = Bun.env.OPENTUI_LIBC ?? "glibc"

const result = await Bun.build({
  entrypoints: [path.join(import.meta.dirname, "src/main.ts")],
  plugins: [solidPlugin],
  target: "bun",
  define: {
    "process.platform": JSON.stringify(process.platform),
    "process.arch": JSON.stringify(process.arch),
    "process.env.OPENTUI_LIBC": JSON.stringify(libc),
  },
  compile: {
    outfile: path.join(import.meta.dirname, "dist/vingroto"),
    assets: [path.join(import.meta.dirname, "../../package.json")],
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
