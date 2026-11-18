import { realpath } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { readPreset } from '../features.ts'
import { formatReport } from '../formatReport/index.ts'
import { doctor } from '../index.ts'
import type { Report } from '../types.ts'

type DoctorRun = { root: string; preset: string | undefined; isJson: boolean }
type DoctorSource = Omit<DoctorRun, 'isJson'>
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
async function inspect({ root, preset }: DoctorSource): Promise<Report> {
  try {
    return await doctor({
      root,
      preset: preset ? readPreset(preset) : undefined
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    return failureReport({ root, message })
  }
}
// A missing root keeps the path as given; the report already says why.
async function resolveRoot(root: string): Promise<string> {
  try {
    return await realpath(root)
  } catch {
    return root
  }
}

export async function runDoctor({
  root,
  preset,
  isJson
}: DoctorRun): Promise<number> {
  const report = await inspect({ root, preset })
  const isStyled = process.stdout.isTTY && !process.env.NO_COLOR
  const output = isJson
    ? JSON.stringify(report)
    : formatReport({ report, realRoot: await resolveRoot(root), isStyled })
  process.stdout.write(`${output}\n`)
  return report.checks.some(check => check.status === 'error') ? 1 : 0
}
