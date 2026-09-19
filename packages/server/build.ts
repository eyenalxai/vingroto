import path from "node:path"

// Why: dbus-next requires the x11 package inside an address fallback vingroto never uses; the build replaces it with a module that refuses to run.
const x11IsNotSupported: Bun.BunPlugin = {
  name: "x11-is-not-supported",
  setup(build) {
    build.onResolve({ filter: /^x11$/u }, () => {
      return { path: "x11", namespace: "x11-unsupported" }
    })
    build.onLoad({ filter: /.*/u, namespace: "x11-unsupported" }, () => {
      return {
        contents: 'throw new Error("x11 is not supported")',
        loader: "js",
      }
    })
  },
}

const result = await Bun.build({
  entrypoints: [path.join(import.meta.dirname, "src/server.ts")],
  target: "bun",
  plugins: [x11IsNotSupported],
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
