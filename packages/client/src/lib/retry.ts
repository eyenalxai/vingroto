import { Duration, Effect, Schedule } from "effect"

const retryInitialDelayMs = 250
const retryMaximumDelayMs = 5000

const retrySchedule = Schedule.exponential(Duration.millis(retryInitialDelayMs)).pipe(
  Schedule.jittered,
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, Duration.millis(retryMaximumDelayMs))),
  ),
)

export { retrySchedule }
