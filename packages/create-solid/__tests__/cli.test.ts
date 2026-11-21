import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  cpSync,
  chmodSync,
  symlinkSync,
  statSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { it, type TestContext } from 'node:test'

import { object, parse, string } from 'valibot'

import { manifestSchema } from '../src/schema.ts'

process.env.LC_ALL = 'C'

const bin = path.resolve('dist/create-solid.mjs')
const executable = 0o755
function folder(context: TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'solid-cli-'))
  context.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

void it('refuses Windows before creating the destination', context => {
  const dir = path.join(folder(context), 'example')
  const override = "Object.defineProperty(process,'platform',{value:'win32'})"
  const child = spawnSync(
    process.execPath,
    [`--import=data:text/javascript,${encodeURIComponent(override)}`, bin, dir],
    { encoding: 'utf8' }
  )
  assert.equal(child.status, 1)
  assert.match(child.stderr, /Windows is unsupported/u)
  assert.ok(!existsSync(dir))
})

void it('preserves generated files on install failure and ignores a parent repository during prepare', context => {
  const parent = folder(context)
  const dir = path.join(parent, 'My App')
  execFileSync('git', ['init', '--quiet'], { cwd: parent })
  writeFileSync(path.join(parent, 'bun'), '#!/bin/sh\nexit 1\n', {
    mode: executable
  })
  const child = spawnSync(
    process.execPath,
    [bin, dir, '--no-git', '--site-url', 'https://app.example'],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${parent}:${process.env.PATH}` }
    }
  )
  assert.equal(child.status, 1)
  const relative = path.relative(process.cwd(), dir)
  assert.ok(
    child.stderr.includes(`Open '${relative}' and run bun install again.`)
  )
  const json = readFileSync(path.join(dir, 'package.json'), 'utf8')
  const manifest = parse(manifestSchema, JSON.parse(json))
  assert.equal(manifest.name, 'my-app')
  assert.match(
    readFileSync(path.join(dir, '.env'), 'utf8'),
    /^VITE_SITE_URL=https:\/\/app.example$/mu
  )
  assert.ok(manifest.scripts.prepare)
  execFileSync('sh', ['-c', manifest.scripts.prepare], { cwd: dir })
})

void it('declares the workspace settings needed by pnpm before installation', context => {
  const dir = folder(context)
  execFileSync(process.execPath, [
    bin,
    dir,
    '--no-git',
    '--no-install',
    '--pm',
    'pnpm'
  ])
  const workspace = path.join(dir, 'pnpm-workspace.yaml')
  assert.doesNotMatch(readFileSync(workspace, 'utf8'), /minimumReleaseAge/u)
  appendFileSync(workspace, 'minimumReleaseAgeExclude:\n  - "@example/pkg"\n')
  symlinkSync(
    path.resolve('../../apps/boilerplate/node_modules'),
    path.join(dir, 'node_modules'),
    'dir'
  )
  const readPreset = [
    "import config from './vite.config.ts'",
    "import assert from 'node:assert/strict'",
    "assert.ok(config({ mode: 'production', command: 'build' }).fmt.ignorePatterns.includes('pnpm-workspace.yaml'))"
  ].join('\n')
  execFileSync(process.execPath, ['--input-type=module', '-e', readPreset], {
    cwd: dir
  })
  execFileSync(path.join(dir, 'node_modules/.bin/vp'), ['fmt', '--check'], {
    cwd: dir
  })
})

void it('shows the versioned package invocation in help', () => {
  const help = execFileSync(process.execPath, [bin, '--help'], {
    encoding: 'utf8'
  })
  assert.match(help, /bunx @evertondgn\/create-solid@latest/u)
})

void it('explains how to continue after Git initialization fails', context => {
  const parent = folder(context)
  const dir = path.join(parent, 'app')
  writeFileSync(path.join(parent, 'git'), '#!/bin/sh\nexit 1\n', {
    mode: executable
  })
  writeFileSync(
    path.join(parent, 'bun'),
    '#!/bin/sh\necho "bun $1" > install.called\n',
    { mode: executable }
  )
  const result = spawnSync(process.execPath, [bin, dir, '--lang', 'en'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: parent }
  })
  assert.equal(result.status, 0)
  assert.match(result.stderr, /■ Creating the Git repository/u)
  assert.match(result.stdout, /│ git init /u)
  assert.match(
    readFileSync(path.join(dir, 'install.called'), 'utf8'),
    /bun install/u
  )
  assert.ok(existsSync(path.join(dir, 'package.json')))
})

void it('preserves the destination when a required tool is missing', context => {
  const parent = folder(context)
  writeFileSync(path.join(parent, 'vp'), '#!/bin/sh\nexit 1\n', {
    mode: executable
  })
  for (const isExisting of [false, true]) {
    const dir = path.join(parent, isExisting ? 'existing' : 'new')
    if (isExisting) mkdirSync(dir)
    const result = spawnSync(process.execPath, [bin, dir, '--no-install'], {
      env: { ...process.env, PATH: parent }
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr.toString(), /Install Git.*git-scm\.com/u)
    assert.equal(existsSync(dir), isExisting)
    assert.ok(!existsSync(path.join(dir, 'package.json')))
  }
})

void it('rolls back owned files and directories on an internal generation error', context => {
  const parent = folder(context)
  cpSync('dist', path.join(parent, 'dist'), { recursive: true })
  symlinkSync(path.resolve('template'), path.join(parent, 'template'))
  const settings = path.join(parent, 'dist/settings.json')
  const input = readFileSync(settings, 'utf8')
  writeFileSync(
    settings,
    input.replace(/"@evertondgn\/solid-runtime":"[^"]+"/u, '"absent":"0"')
  )
  for (const isExisting of [true, false]) {
    const dir = path.join(parent, isExisting ? 'existing' : 'new/nested/app')
    if (isExisting) mkdirSync(dir)
    const result = spawnSync(
      process.execPath,
      [
        path.join(parent, 'dist/create-solid.mjs'),
        dir,
        '--no-git',
        '--no-install'
      ],
      { encoding: 'utf8' }
    )
    assert.match(result.stderr, /Missing version for/u)
    assert.equal(result.status, 1)
    if (isExisting) assert.deepEqual(readdirSync(dir), [])
    else assert.ok(!existsSync(path.join(parent, 'new')))
  }
})

void it('keeps the identity of an existing empty directory', context => {
  const dir = folder(context)
  const before = statSync(dir)
  execFileSync(process.execPath, [bin, dir, '--no-install', '--no-git'])
  assert.equal(statSync(dir).ino, before.ino)
})

void it('generates without a formatter or installer on PATH when setup is disabled', context => {
  const parent = folder(context)
  const dir = path.join(parent, 'app')
  const output = execFileSync(
    process.execPath,
    [bin, dir, '--no-install', '--no-git'],
    { encoding: 'utf8', env: { ...process.env, PATH: parent } }
  )
  const steps = output.slice(output.lastIndexOf('Next steps'))
  assert.ok(steps.indexOf('Install Bun') < steps.indexOf('cd '))
  assert.ok(output.includes('│ bun install '))
  assert.match(
    output.slice(output.lastIndexOf('Next steps')),
    /Install Bun from https:\/\/bun.sh/u
  )
  assert.ok(existsSync(path.join(dir, 'package.json')))
})

void it('completes a successful pnpm install without invoking a formatter', context => {
  const parent = folder(context)
  const dir = path.join(parent, 'app')
  writeFileSync(path.join(parent, 'pnpm'), '#!/bin/sh\nexit 0\n', {
    mode: executable
  })
  const result = spawnSync(
    process.execPath,
    [bin, dir, '--no-git', '--pm', 'pnpm'],
    { encoding: 'utf8', env: { ...process.env, PATH: parent } }
  )
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout, /pnpm exec vp fmt/u)
  for (const line of [
    'Creating the files',
    'Files created',
    'Installing dependencies with pnpm',
    'Dependencies installed with pnpm'
  ]) {
    const occurrences = result.stdout
      .split('\n')
      .filter(value => value === `◇ ${line}`)
    assert.equal(
      occurrences.length,
      line.startsWith('Creating') || line.startsWith('Installing') ? 0 : 1
    )
  }
})

void it('directs a client application with SEO to static hosting before writing files', context => {
  const dir = path.join(folder(context), 'client')
  const result = spawnSync(
    process.execPath,
    [bin, dir, '--mode', 'client', '--seo', '--no-install', '--no-git'],
    { encoding: 'utf8' }
  )
  const usageError = 2
  assert.equal(result.status, usageError)
  assert.match(result.stderr, /--mode static/u)
  assert.equal(existsSync(dir), false)
})

void it('prints help before validating other arguments', () => {
  const child = spawnSync(process.execPath, [bin, '--unknown', '--help'], {
    encoding: 'utf8'
  })
  assert.equal(child.status, 0)
  assert.match(child.stdout, /--mode server/u)
})

void it('rejects contradictory feature switches', () => {
  const usageError = 2
  for (const option of ['seo', 'theme', 'icons', 'fonts', 'diagnostics']) {
    const child = spawnSync(
      process.execPath,
      [bin, '.', `--${option}`, `--no-${option}`],
      {
        encoding: 'utf8'
      }
    )
    assert.equal(child.status, usageError)
    assert.ok(
      child.stderr.includes(`Choose either --${option} or --no-${option}.`)
    )
  }
})

void it('generates inside an empty destination with a read-only parent', context => {
  const parent = folder(context)
  const destination = path.join(parent, 'app')
  mkdirSync(destination)
  const readOnly = 0o555
  chmodSync(parent, readOnly)
  try {
    execFileSync(process.execPath, [
      bin,
      destination,
      '--no-install',
      '--no-git'
    ])
    assert.ok(existsSync(path.join(destination, 'package.json')))
  } finally {
    chmodSync(parent, executable)
  }
})

void it('keeps every rename on the destination device', context => {
  const destination = folder(context)
  const guard = `import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'
const rename = fs.renameSync
const root = process.argv[2] + path.sep
fs.renameSync = (source, target) => {
  if (!source.startsWith(root) || !target.startsWith(root)) {
    throw Object.assign(new Error('Cross-device rename'), { code: 'EXDEV' })
  }
  return rename(source, target)
}
syncBuiltinESMExports()`
  execFileSync(process.execPath, [
    `--import=data:text/javascript,${encodeURIComponent(guard)}`,
    bin,
    destination,
    '--no-install',
    '--no-git'
  ])
  assert.ok(existsSync(path.join(destination, 'package.json')))
})

void it('reports an internal TypeError as an execution failure', context => {
  const destination = folder(context)
  const fault = `import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
fs.mkdtempSync = () => { throw new TypeError('Internal failure') }
syncBuiltinESMExports()`
  const result = spawnSync(
    process.execPath,
    [
      `--import=data:text/javascript,${encodeURIComponent(fault)}`,
      bin,
      destination,
      '--no-install',
      '--no-git'
    ],
    { encoding: 'utf8' }
  )
  assert.match(result.stderr, /Internal failure/u)
  assert.equal(result.status, 1)
})

void it('rejects a site origin without SEO through the CLI and API', async context => {
  const dir = path.join(folder(context), 'example')
  const siteUrl = 'https://example.com'
  const child = spawnSync(
    process.execPath,
    [bin, dir, '--no-seo', '--site-url', siteUrl],
    { encoding: 'utf8' }
  )
  const usageError = 2
  assert.equal(child.status, usageError)
  assert.match(child.stderr, /--site-url requires SEO/u)
  const { generate } = await import('@evertondgn/create-solid')
  assert.throws(
    () =>
      generate({
        dir,
        siteUrl,
        pm: 'bun',
        hasSeo: false,
        shouldInitGit: false,
        shouldInstall: false
      }),
    /--site-url requires SEO/u
  )
  assert.ok(!existsSync(dir))
})

void it('rejects invalid titles before creating an application', async context => {
  const { generate } = await import('@evertondgn/create-solid')
  const dir = path.join(folder(context), 'bad-title')
  const usageError = 2
  for (const title of ['', '  ', 'one\ntwo', 'one\ttwo', 'a\u007Fb']) {
    const child = spawnSync(process.execPath, [bin, dir, '--title', title], {
      encoding: 'utf8'
    })
    assert.equal(child.status, usageError)
    assert.match(child.stderr, /--title requires/u)
    assert.throws(
      () =>
        generate({
          title,
          dir,
          pm: 'bun',
          shouldInitGit: false,
          shouldInstall: false
        }),
      /--title requires/u
    )
    assert.ok(!existsSync(dir))
  }
})

async function generatedTitle(dir: string): Promise<string> {
  const module: unknown = await import(
    path.join(dir, 'src/constants/site/title.ts')
  )
  const schema = object({ SITE: object({ title: string() }) })
  return parse(schema, module).SITE.title
}

for (const destination of ['.', '../x/y']) {
  void it(`derives the CLI title from the resolved destination ${destination}`, async context => {
    const cwd = path.join(folder(context), 'My App')
    mkdirSync(cwd)
    const dir = path.resolve(cwd, destination)
    execFileSync(
      process.execPath,
      [bin, destination, '--no-git', '--no-install'],
      { cwd }
    )
    assert.equal(await generatedTitle(dir), path.basename(dir))
  })
}

void it('uses the resolved folder for the API package name and title', async context => {
  const dir = path.join(folder(context), 'My App')
  mkdirSync(dir)
  const generator = new URL('../src/generate.ts', import.meta.url).href
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { generate } from ${JSON.stringify(generator)}
     generate({ dir: '.', pm: 'bun', shouldInstall: false, shouldInitGit: false })`
    ],
    { cwd: dir }
  )
  const json = readFileSync(path.join(dir, 'package.json'), 'utf8')
  const manifest = parse(manifestSchema, JSON.parse(json))
  assert.equal(manifest.name, 'my-app')
  assert.equal(await generatedTitle(dir), 'My App')
})

void it('explains conflicting positional destinations', () => {
  for (const [language, expected] of [
    ['en', 'Pass a single project directory.'],
    ['es', 'Indica una sola carpeta de proyecto.'],
    ['pt-BR', 'Informe uma única pasta de projeto.']
  ] as const) {
    const result = spawnSync(
      process.execPath,
      [bin, 'a', 'b', '--lang', language],
      { encoding: 'utf8' }
    )
    const usageExitCode = 2
    assert.equal(result.status, usageExitCode)
    assert.equal(result.stderr.trim(), expected)
  }
})

void it('requires a destination without a terminal and translates flag errors', context => {
  const cwd = folder(context)
  for (const flags of [
    [],
    ['--no-interactive'],
    ['--name', 'app', '--mode', 'other'],
    ['--name', 'app', '--no-theme', '--theme']
  ]) {
    const result = spawnSync(
      process.execPath,
      [bin, '--lang', 'pt-BR', ...flags],
      { cwd, env: { ...process.env, CI: '1' }, encoding: 'utf8' }
    )
    const expectedUsageExit = 2
    assert.equal(result.status, expectedUsageExit)
    assert.match(result.stderr, /--name|--mode|--theme/u)
    assert.deepEqual(readdirSync(cwd), [])
  }
})

void it('accepts every default with yes and prints plain next steps', context => {
  const cwd = folder(context)
  for (const tool of ['git', 'bun']) {
    writeFileSync(
      path.join(cwd, tool),
      `#!/bin/sh\nif read -r unexpected; then exit 9; fi\necho "$1" > "${tool}.called"\n`,
      { mode: executable }
    )
  }
  const result = spawnSync(process.execPath, [bin, '--yes', '--lang', 'es'], {
    cwd,
    encoding: 'utf8',
    input: 'unexpected input\n',
    env: { ...process.env, NO_COLOR: '1', PATH: cwd }
  })
  assert.equal(result.status, 0, result.stderr)
  const dir = path.join(cwd, 'solid-app')
  assert.equal(readFileSync(path.join(dir, 'bun.called'), 'utf8'), 'install\n')
  assert.equal(readFileSync(path.join(dir, 'git.called'), 'utf8'), 'init\n')
  assert.match(result.stdout, /Próximos pasos/u)
  assert.ok(!result.stdout.includes('\u001B'))
})

for (const signal of ['SIGINT', 'SIGHUP', 'SIGTERM']) {
  void it(`removes staging and owned parents on ${signal} during generation`, context => {
    const root = folder(context)
    const dir = path.join(root, 'new', 'app')
    const signalAfterCopy = `import fs from 'node:fs'
import {syncBuiltinESMExports} from 'node:module'
const copy = fs.cpSync
fs.cpSync = (...args) => {
  fs.cpSync = copy
  syncBuiltinESMExports()
  process.kill(process.pid,'${signal}')
  return copy(...args)
}
syncBuiltinESMExports()`
    const result = spawnSync(
      process.execPath,
      [
        `--import=data:text/javascript,${encodeURIComponent(signalAfterCopy)}`,
        bin,
        dir,
        '--no-git',
        '--no-install'
      ],
      { encoding: 'utf8' }
    )
    const interrupted = 130
    assert.equal(result.status, interrupted, result.stderr)
    assert.deepEqual(readdirSync(root), [])
  })
}

void it('preserves the published project and gives a resume command on install cancellation', context => {
  const root = folder(context)
  const dir = path.join(root, 'app')
  writeFileSync(
    path.join(root, 'bun'),
    '#!/bin/sh\nkill -INT "$PPID"\nexec /bin/sleep 10\n',
    { mode: executable }
  )
  const result = spawnSync(
    process.execPath,
    [bin, dir, '--lang', 'es', '--no-git'],
    { encoding: 'utf8', timeout: 5000, env: { ...process.env, PATH: root } }
  )
  const canceled = 130
  assert.equal(result.status, canceled, result.stderr)
  assert.match(result.stderr, /ejecuta bun install de nuevo/u)
  assert.ok(existsSync(path.join(dir, 'package.json')))
})

void it('skips the questionnaire on terminal stdin with CI or no-interactive', context => {
  const cwd = folder(context)
  const terminal = "Object.defineProperty(process.stdin,'isTTY',{value:true})"
  const preload = `--import=data:text/javascript,${encodeURIComponent(terminal)}`
  const expectedUsageExit = 2
  const env = { ...process.env }
  delete env.CI
  for (const { flags, environment } of [
    { flags: ['--no-interactive'], environment: env },
    { flags: [], environment: { ...env, CI: 'true' } }
  ]) {
    const child = spawnSync(process.execPath, [preload, bin, ...flags], {
      cwd,
      env: environment,
      encoding: 'utf8',
      timeout: 5000
    })
    assert.equal(child.status, expectedUsageExit)
    assert.match(child.stderr, /--name/u)
    assert.deepEqual(readdirSync(cwd), [])
  }
})

void it('prints the Bun installation link before starting the selected installer', context => {
  const root = folder(context)
  writeFileSync(path.join(root, 'npm'), '#!/bin/sh\necho installer-started\n', {
    mode: executable
  })
  const dir = path.join(root, 'app')
  const result = spawnSync(
    process.execPath,
    [bin, dir, '--lang', 'es', '--pm', 'npm', '--no-git'],
    { env: { ...process.env, PATH: root }, encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
  const link = result.stdout.indexOf('https://bun.sh')
  assert.ok(link !== -1 && link < result.stdout.indexOf('installer-started'))
  assert.ok(result.stdout.includes('npm run dev'))
})

void it('rejects an unsupported explicit language before showing help', () => {
  for (const flags of [
    ['--lang', 'fr'],
    ['--lang=fr', '--help']
  ]) {
    const result = spawnSync(process.execPath, [bin, ...flags], {
      encoding: 'utf8'
    })
    const usageError = 2
    assert.equal(result.status, usageError)
    assert.match(result.stderr, /--lang accepts pt-BR, en or es: fr/u)
  }
})

void it('preserves desktop metadata and an existing Git directory without running Git', context => {
  const root = folder(context)
  const app = path.join(root, 'app')
  mkdirSync(path.join(app, '.git'), { recursive: true })
  for (const name of ['.DS_Store', 'Thumbs.db', '.git/HEAD']) {
    writeFileSync(path.join(app, name), name)
  }
  execFileSync(process.execPath, [bin, app, '--yes', '--no-install'], {
    env: { ...process.env, PATH: root }
  })
  for (const name of ['.DS_Store', 'Thumbs.db', '.git/HEAD']) {
    assert.equal(readFileSync(path.join(app, name), 'utf8'), name)
  }
  assert.ok(existsSync(path.join(app, 'package.json')))
})

void it('reports cancellation during Git setup after publishing the tree', context => {
  const root = folder(context)
  const dir = path.join(root, 'my app')
  writeFileSync(
    path.join(root, 'git'),
    '#!/bin/sh\nkill -INT "$PPID"\nexec /bin/sleep 10\n',
    { mode: executable }
  )
  writeFileSync(path.join(root, 'bun'), '#!/bin/sh\nexit 0\n', {
    mode: executable
  })
  const result = spawnSync(process.execPath, [bin, dir, '--lang', 'en'], {
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, PATH: root }
  })
  const canceled = 130
  assert.equal(result.status, canceled)
  assert.match(result.stderr, /Creation canceled/u)
  assert.doesNotMatch(result.stderr, /Git initialization failed/u)
  const relative = path.relative(process.cwd(), dir)
  assert.ok(
    result.stderr.includes(
      `Your project is in '${relative}'. To finish, run:\ngit init\nbun install`
    )
  )
  assert.ok(existsSync(path.join(dir, 'package.json')))
})

void it('lists each flag once with a description through both help aliases', () => {
  for (const language of ['en', 'pt-BR', 'es']) {
    const read = (flag: string) =>
      execFileSync(process.execPath, [bin, '--lang', language, flag], {
        encoding: 'utf8'
      })
    const help = read('-h')
    assert.equal(help, read('--help'))
    assert.match(help, /^npm .*pnpm .*Bun/mu)
    const descriptions = help
      .split('\n')
      .filter(line => /^ {2}--(?:mode|title) /u.test(line))
    const headingCount = 2
    const descriptionColumn = 31
    const indent = 2
    assert.equal(descriptions.length, headingCount)
    for (const line of descriptions) {
      assert.match(line, /^.{31}\S/u)
      assert.equal(
        line.slice(indent, descriptionColumn).trimEnd().includes('  '),
        false
      )
    }
    const options = help.split('\n').filter(line => line.startsWith('  -'))
    const terminalWidth = 80
    assert.ok(
      options
        .filter(line => line.trimStart().startsWith('--yes '))
        .every(line => line.length <= terminalWidth)
    )
    const flags = options.map(line => line.trim().split(/\s+/u)[0])
    assert.equal(new Set(flags).size, flags.length)
    for (const flag of ['--mode', '--no-icons', '--install', '--yes', '-h']) {
      assert.ok(flags.includes(flag))
    }
    for (const line of options) assert.match(line, /^ {2}-\S+.*? {2,}\S/u)
  }
})

void it('preserves an occupied destination with flags and with yes', context => {
  const dir = folder(context)
  const marker = path.join(dir, 'notes.txt')
  writeFileSync(marker, 'keep')
  for (const flags of [[], ['--yes']]) {
    const result = spawnSync(
      process.execPath,
      [bin, dir, '--lang', 'en', ...flags],
      { encoding: 'utf8' }
    )
    const usageError = 2
    assert.equal(result.status, usageError)
    assert.ok(
      result.stderr.includes(
        `The project directory must be new or empty: ${dir}`
      )
    )
    assert.deepEqual(readdirSync(dir), ['notes.txt'])
    assert.equal(readFileSync(marker, 'utf8'), 'keep')
  }
})

void it('explains a missing tool before the summary in unattended setup', context => {
  const root = folder(context)
  const child = spawnSync(process.execPath, [bin, '--lang', 'en', '--yes'], {
    cwd: root,
    env: { ...process.env, PATH: root },
    encoding: 'utf8'
  })
  assert.equal(child.status, 1)
  assert.match(child.stderr, /https:\/\/git-scm.com\/downloads/u)
  assert.doesNotMatch(child.stdout, /Project summary/u)
  assert.deepEqual(readdirSync(root), [])
})
