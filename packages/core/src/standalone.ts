// Compiled binaries mount embedded assets under a virtual root that every bundled module sees as its own directory.
// Source runs read the repository tree instead, so reads of bundled files branch at runtime.
const isStandaloneExecutable = Bun.isStandaloneExecutable

export { isStandaloneExecutable }
