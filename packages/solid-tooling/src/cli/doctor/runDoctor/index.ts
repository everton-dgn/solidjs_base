import path from 'node:path'
import process from 'node:process'

import { readPreset } from '../features.ts'
import { formatReport } from '../formatReport/index.ts'
import { doctor } from '../index.ts'
import type { Report } from '../types.ts'

type DoctorRun = { root: string; preset: string | undefined; isJson: boolean }
type Failure = { root: string; message: string }

// The JSON consumer still gets a report with the same keys when the
// application cannot be inspected at all.
function failureReport({ root, message }: Failure): Report {
  return {
    root,
    workspaceRoot: root,
    skills: [],
    packages: [],
    validation: { cwd: root, commands: [] },
    checks: [
      {
        id: 'application-manifest',
        status: 'error',
        package: null,
        expected: 'readable manifest',
        observed: message,
        source: root,
        file: path.join(root, 'package.json'),
        fix: 'Repair the application manifest.'
      }
    ]
  }
}

export async function runDoctor({
  root,
  preset,
  isJson
}: DoctorRun): Promise<number> {
  try {
    const report = await doctor({
      root,
      preset: preset ? readPreset(preset) : undefined
    })
    process.stdout.write(
      `${isJson ? JSON.stringify(report) : formatReport(report)}\n`
    )
    return report.checks.some(check => check.status === 'error') ? 1 : 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    if (isJson) {
      process.stdout.write(JSON.stringify(failureReport({ root, message })))
    }
    return 1
  }
}
