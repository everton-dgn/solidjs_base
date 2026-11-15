import { createGitHub } from './github.ts'
import { createRegistry } from './registry.ts'
import type { Environment, RunCommand, Session, Timing } from './types.ts'

type SessionOptions = {
  environment: Environment
  timing: Timing
  isDryRun: boolean
}

// The dry run builds the same commands as a real run, so a write that slips
// through a branch of the flow fails here instead of reaching GitHub.
function refuseWrites(run: RunCommand): RunCommand {
  return command =>
    command.isWrite
      ? Promise.reject(
          new Error(
            `The dry run refused to run "${command.file} ${command.args.join(' ')}".`
          )
        )
      : run(command)
}

export function createSession({
  environment,
  timing,
  isDryRun
}: SessionOptions): Session {
  const run = isDryRun ? refuseWrites(environment.run) : environment.run
  return {
    timing,
    environment,
    github: createGitHub(run),
    registry: createRegistry(run)
  }
}
