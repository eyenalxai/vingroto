import type { JSX } from "@opentui/solid"

import { createContext, useContext } from "solid-js"

import type { AppRuntime } from "@/lib/client/runtime"

const RuntimeContext = createContext<AppRuntime>()

const RuntimeProvider = (props: {
  readonly runtime: AppRuntime
  readonly children: JSX.Element
}) => <RuntimeContext.Provider value={props.runtime}>{props.children}</RuntimeContext.Provider>

const useRuntime = () => {
  const runtime = useContext(RuntimeContext)
  if (runtime === undefined) {
    throw new Error("useRuntime must be used inside RuntimeProvider")
  }
  return runtime
}

export { RuntimeProvider, useRuntime }
