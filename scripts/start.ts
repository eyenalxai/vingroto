import path from "node:path"

const root = path.join(import.meta.dirname, "..")

const server = Bun.spawn(["bun", "src/server.ts"], {
  cwd: path.join(root, "packages", "server"),
  stdin: "ignore",
  stdout: "inherit",
  stderr: "inherit",
})

const client = Bun.spawn(["bun", "src/main.ts"], {
  cwd: path.join(root, "packages", "client"),
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

const exitCode = await client.exited
// Quitting the tui ends the daemon this command started, so one command owns both processes.
server.kill("SIGINT")
await server.exited
process.exitCode = exitCode
