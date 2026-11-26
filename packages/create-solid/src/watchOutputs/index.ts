import process from 'node:process'

import { message, type Language } from '../cli-language.ts'

type FailureReport = { language: Language; resume: string }
type OutputFailure = { output: NodeJS.WriteStream; code: string }
type OutputWatch = {
  signal: AbortSignal
  canWrite: (output: NodeJS.WriteStream) => boolean
  report: (failure: FailureReport) => void
}
// WHY: A write to a terminal that closed fails with EIO and one to a pipe whose reader ended fails with EPIPE, both on a later tick. Node then opens process.stdout and process.stderr again, so each later write fails the same way and lands here, and the CLI goes on with what it was doing. Any other failure, such as EIO or ENOSPC on a file, stops the CLI as a signal does, so that the installer still cleans up, and each later failure of that output lands here too.
export function watchOutputs(): OutputWatch {
  const controller = new AbortController()
  const unavailable = new Set<NodeJS.WriteStream>()
  const canWrite = (output: NodeJS.WriteStream) => !unavailable.has(output)
  let firstFailure: OutputFailure | undefined
  let isReported = false
  const recordFailure =
    (output: NodeJS.WriteStream) => (error: NodeJS.ErrnoException) => {
      unavailable.add(output)
      const isGone =
        error.code === 'EPIPE' || (error.code === 'EIO' && output.isTTY)
      if (isGone || firstFailure) return
      firstFailure = { output, code: error.code ?? error.message }
      controller.abort(error)
    }
  for (const output of [process.stdout, process.stderr]) {
    output.on('error', recordFailure(output))
  }
  return {
    signal: controller.signal,
    canWrite,
    report({ language, resume }) {
      process.exitCode = 1
      if (isReported || !firstFailure) return
      isReported = true
      const { output, code } = firstFailure
      const other = output === process.stdout ? process.stderr : process.stdout
      if (!canWrite(other)) return
      const line = message(language, {
        code: output === process.stdout ? 'stdoutFailed' : 'stderrFailed',
        values: { code }
      })
      other.write(`${[line, resume].filter(Boolean).join('\n')}\n`)
    }
  }
}
