import { spawn } from 'node:child_process'
import path from 'node:path'
import process, { argv, execPath } from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { runAgents } from './agents/runAgents/index.ts'
import { runDoctor } from './doctor/runDoctor/index.ts'

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
function applicationRoot(value: string | undefined): string {
  if (!value) throw new Error('Specify --root <application>')
  return path.resolve(value)
}
if (name === 'agents') {
  const { values } = parseArgs({
    args,
    options: { root: { type: 'string' }, check: { type: 'boolean' } }
  })
  process.exitCode = await runAgents({
    root: applicationRoot(values.root),
    shouldCheck: values.check === true
  })
} else if (name === 'doctor') {
  const { values } = parseArgs({
    args,
    options: {
      root: { type: 'string' },
      json: { type: 'boolean' },
      preset: { type: 'string' }
    }
  })
  process.exitCode = await runDoctor({
    root: applicationRoot(values.root),
    preset: values.preset,
    isJson: values.json === true
  })
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
