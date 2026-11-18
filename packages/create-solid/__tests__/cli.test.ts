import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
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
printf 'minimumReleaseAgeExclude:\\n  - "@example/pkg"\\n' >> pnpm-workspace.yaml
`,
    { mode: executable }
  )
  const realVp = execFileSync('which', ['vp'], { encoding: 'utf8' }).trim()
  // Use the packed formatting config before installation has provided the preset.
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
