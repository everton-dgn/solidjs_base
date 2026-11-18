import { spawn } from 'node:child_process'
import path from 'node:path'
import process, { argv, execPath } from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { agents } from './agents/index.ts'
import { readPreset } from './doctor/features.ts'
import { doctor } from './doctor/index.ts'

type Tool = { runtime: string; entry: () => string }
const CLI_ARGUMENT_OFFSET = 2

const TOOLS: Record<string, Tool> = {
  knip: {
    runtime: 'bun',
    entry: () => new URL('../bin/knip-bun.js', import.meta.resolve('knip')).href
  },
  tsrs: {
    runtime: execPath,
    entry: () =>
      new URL('bin/tsrs', import.meta.resolve('tsrs/package.json')).href
  },
  playwright: {
    runtime: execPath,
    entry: () => import.meta.resolve('@playwright/test/cli')
  },
  lefthook: { runtime: execPath, entry: () => import.meta.resolve('lefthook') },
  commitlint: {
    runtime: execPath,
    entry: () => import.meta.resolve('@commitlint/cli/cli.js')
  }
}

const [name = '', ...args] = argv.slice(CLI_ARGUMENT_OFFSET)
if (name === 'agents' || name === 'doctor') {
  const { values } = parseArgs({
    args,
    options: {
      root: { type: 'string' },
      check: { type: 'boolean' },
      json: { type: 'boolean' },
      preset: { type: 'string' }
    }
  })
  if (typeof values.root !== 'string' || !values.root) {
    throw new Error('Specify --root <application>')
  }
  const root = path.resolve(values.root)
  if (name === 'agents') {
    const state = await agents({ root, write: !values.check })
    if (values.check && state !== 'current') {
      process.stderr.write(`AGENTS.md: ${state}\n`)
      process.exitCode = 1
    }
  } else {
    try {
      const report = await doctor({
        root,
        preset: values.preset ? readPreset(values.preset) : undefined
      })
      const human = [
        root,
        ...report.packages.map(item => `${item.package} ${item.version}`),
        ...report.skills.map(item => item.path),
        ...report.checks
          .filter(item => item.status !== 'ok')
          .map(
            item =>
              `${item.status} ${item.id} ${item.package}: ${item.observed}. ${item.fix}`
          ),
        ...report.validation.commands
      ]
      process.stdout.write(
        `${values.json ? JSON.stringify(report) : human.join('\n')}\n`
      )
      if (report.checks.some(check => check.status === 'error')) {
        process.exitCode = 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`${message}\n`)
      if (values.json) {
        process.stdout.write(
          JSON.stringify({
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
          })
        )
      }
      process.exitCode = 1
    }
  }
} else {
  const tool = Object.hasOwn(TOOLS, name) ? TOOLS[name] : undefined
  if (!tool) {
    throw new Error(`Choose a packaged tool: ${Object.keys(TOOLS).join(', ')}`)
  }
  const child = spawn(tool.runtime, [fileURLToPath(tool.entry()), ...args], {
    stdio: 'inherit'
  })
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(signal)
      }
    })
  }
  child.on('error', error => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
  child.on('exit', code => {
    process.exitCode = code ?? process.exitCode ?? 1
  })
}
