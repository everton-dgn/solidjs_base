import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { stripVTControlCharacters } from 'node:util'

import type { Check, Report } from '../../types.ts'
import { formatReport } from '../index.ts'

type CheckFields = Pick<Check, 'id' | 'status' | 'package' | 'file'>

const ROOT = path.resolve('/workspace/apps/web')
const REAL_ROOT = path.resolve('/volume/apps/web')
const INSTALLATION = path.resolve('/workspace')
const SKILLS = {
  tooling: path.join(
    ROOT,
    'node_modules/@evertondgn/solid-tooling/skills/solid-base-app/SKILL.md'
  ),
  runtime: path.join(
    REAL_ROOT,
    'node_modules/@evertondgn/solid-runtime/skills/solid-base-runtime/SKILL.md'
  ),
  solid: path.join(
    INSTALLATION,
    'node_modules/solid-js/skills/solid-2.0/SKILL.md'
  )
}

function check({ id, status, package: name, file }: CheckFields): Check {
  return {
    id,
    status,
    package: name,
    expected: '1.0.0',
    observed: '3.0.0',
    source: path.join(ROOT, 'package.json'),
    file,
    fix: `Fix ${id}.`
  }
}
const REPORT: Report = {
  root: ROOT,
  workspaceRoot: INSTALLATION,
  packages: [
    {
      package: 'solid-js',
      version: '2.0.0',
      source: ROOT,
      file: path.join(INSTALLATION, 'node_modules/solid-js/package.json')
    },
    {
      package: '@evertondgn/solid-tooling',
      version: '0.10.0',
      source: ROOT,
      file: path.join(
        ROOT,
        'node_modules/@evertondgn/solid-tooling/package.json'
      )
    }
  ],
  skills: [
    { package: 'solid-js', source: ROOT, path: SKILLS.solid },
    {
      package: '@evertondgn/solid-tooling',
      source: ROOT,
      path: SKILLS.tooling
    },
    { package: '@evertondgn/solid-runtime', source: ROOT, path: SKILLS.runtime }
  ],
  checks: [
    check({
      id: 'node-version',
      status: 'ok',
      package: 'solid-js',
      file: path.join(ROOT, 'package.json')
    }),
    check({
      id: 'i18n-dependency',
      status: 'warning',
      package: '@inlang/paraglide-js',
      file: path.join(ROOT, 'package.json')
    }),
    check({
      id: 'peer-version',
      status: 'error',
      package: '@solidjs/web',
      file: path.join(INSTALLATION, 'package.json')
    })
  ],
  validation: { cwd: ROOT, commands: ['vp run check-project', 'vp run test'] }
}

test('prints each section, with the problems and the skill paths to read', () => {
  const output = formatReport({
    report: REPORT,
    realRoot: REAL_ROOT,
    isStyled: false
  })
  const lines = output.split('\n')
  const headings = [
    'Application',
    'Installed packages',
    'Checks: 1 passed, 1 warning, 1 error',
    'Skills to read',
    'Commands that validate a change'
  ]
  const positions = headings.map(heading => lines.indexOf(heading))
  assert.ok(
    positions.every(position => position >= 0),
    output
  )
  assert.deepEqual(
    positions.toSorted((a, b) => a - b),
    positions
  )
  assert.ok(lines.includes(`  installation root  ${INSTALLATION}`))
  assert.ok(
    lines.indexOf('  @evertondgn/solid-tooling  0.10.0') <
      lines.indexOf('  solid-js                   2.0.0')
  )
  const error = lines.indexOf('  error peer-version @solidjs/web')
  const warning = lines.indexOf(
    '  warning i18n-dependency @inlang/paraglide-js'
  )
  assert.ok(error > 0 && warning > error, output)
  const details = [
    '      expected 1.0.0, observed 3.0.0',
    '      source: package.json',
    '      fix: Fix peer-version.',
    `      edit: ${path.join(INSTALLATION, 'package.json')}`
  ]
  assert.deepEqual(lines.slice(error + 1, error + 1 + details.length), details)
  assert.ok(!output.includes('node-version'))
  assert.ok(
    lines.includes(`    ${path.relative(ROOT, SKILLS.tooling)}`),
    'a skill inside the root is relative'
  )
  assert.ok(
    lines.includes(`    ${path.relative(REAL_ROOT, SKILLS.runtime)}`),
    'a skill inside the real root is relative'
  )
  assert.ok(
    lines.includes(`    ${SKILLS.solid}`),
    'a skill outside stays absolute'
  )
  assert.ok(lines.includes('  vp run check-project'))
  assert.equal(stripVTControlCharacters(output), output)
  assert.ok(!['✔', '⚠', '✖'].some(symbol => output.includes(symbol)))
})

test('adds color and symbols only when styled', () => {
  const output = formatReport({
    report: REPORT,
    realRoot: REAL_ROOT,
    isStyled: true
  })
  const text = stripVTControlCharacters(output)
  assert.notEqual(text, output)
  assert.ok(text.includes('Checks: ✔ 1 passed, ⚠ 1 warning, ✖ 1 error'))
  assert.ok(text.includes('  ✖ error peer-version @solidjs/web'))
})

test('reports an unreadable application without packages or skills', () => {
  const output = formatReport({
    report: {
      root: ROOT,
      workspaceRoot: ROOT,
      packages: [],
      skills: [],
      checks: [
        check({
          id: 'application-manifest',
          status: 'error',
          package: null,
          file: path.join(ROOT, 'package.json')
        })
      ],
      validation: { cwd: ROOT, commands: [] }
    },
    realRoot: ROOT,
    isStyled: false
  })
  const lines = output.split('\n')
  assert.ok(lines.includes('  error application-manifest'), output)
  assert.ok(!output.includes('installation root'))
  assert.ok(!output.includes('null'))
  for (const heading of [
    'Installed packages',
    'Skills to read',
    'Commands that validate a change'
  ]) {
    assert.equal(lines[lines.indexOf(heading) + 1], '  none found')
  }
})
