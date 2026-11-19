import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
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

import { parse } from 'valibot'

import { manifestSchema } from '../src/schema.ts'

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
  assert.ok(child.stderr.includes(`Open ${dir} and run bun install again.`))
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

void it('formats pnpm settings added by the installer', context => {
  const parent = folder(context)
  const dir = path.join(parent, 'example')
  mkdirSync(dir)
  writeFileSync(
    path.join(parent, 'pnpm'),
    `#!/bin/sh
mkdir -p node_modules/.bin
cp "$TEST_VP" node_modules/.bin/vp
printf 'minimumReleaseAgeExclude:\\n  - "@example/pkg"\\n' >> pnpm-workspace.yaml
`,
    { mode: executable }
  )
  const realVp = execFileSync('which', ['vp'], { encoding: 'utf8' }).trim()
  // The fake installer supplies a local vp that uses the application formatting preset.
  const formatter = path.resolve('dist/formatter')
  writeFileSync(
    path.join(parent, 'vp'),
    `#!/bin/sh
if [ "$2" = pnpm-workspace.yaml ]; then
  file="$PWD/$2"
  cd "$FORMATTER" || exit 1
  "$REAL_VP" fmt --stdin-filepath=pnpm-workspace.yaml < "$file" > "$file.formatted" && mv "$file.formatted" "$file"
else
  exec "$REAL_VP" "$@"
fi
`,
    { mode: executable }
  )
  execFileSync(process.execPath, [bin, dir, '--no-git', '--pm', 'pnpm'], {
    env: {
      ...process.env,
      PATH: `${parent}:${process.env.PATH}`,
      TEST_VP: path.join(parent, 'vp'),
      REAL_VP: realVp,
      FORMATTER: formatter
    }
  })
  assert.match(
    readFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'utf8'),
    /minimumReleaseAgeExclude:\n {2}- '@example\/pkg'/u
  )
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
  const result = spawnSync(process.execPath, [bin, dir], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${parent}:${process.env.PATH}` }
  })
  assert.equal(result.status, 1)
  assert.ok(result.stderr.includes(`Open ${dir} and run git init`))
  assert.ok(result.stderr.includes('bun install'))
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
    assert.match(result.stderr.toString(), /Install git/u)
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
  assert.ok(output.includes('Run bun install.'))
  assert.ok(existsSync(path.join(dir, 'package.json')))
})

void it('reports a local formatter failure after a successful pnpm install', context => {
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
  assert.equal(result.status, 1)
  assert.match(result.stderr, /pnpm installed dependencies.*pnpm exec vp fmt/u)
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
  assert.equal(child.status, 2)
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
