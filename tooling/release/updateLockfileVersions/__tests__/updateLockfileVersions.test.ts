import assert from 'node:assert/strict'
import {
  mkdir,
  readFile,
  stat,
  symlink,
  truncate,
  utimes,
  writeFile
} from 'node:fs/promises'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'

import { updateLockfileVersions } from '../index.ts'
import {
  editLine,
  lineNumber,
  LOCKED,
  makeWorkspace,
  MANIFESTS,
  RELEASED,
  renderLock,
  writeManifest
} from './fixtures.ts'

type Setup = {
  context: TestContext
  generated: string
  lock?: string
  manifests?: Record<string, string>
}

type Refusal = { file: string; problems: readonly string[] }

const CURRENT = renderLock(LOCKED)
const NEXT = renderLock(RELEASED)
const RUNTIME_ENTRY = '    "packages/runtime": {'
const RUNTIME_VERSION = `      "version": "${LOCKED.runtime}",`
const HELP =
  'Generate it again from this tree, or see docs/releasing.md#when-the-release-lockfile-workflow-fails.'
const PAST = new Date('2020-01-01T00:00:00Z')
// One byte over the 16 MiB the command reads.
const TOO_LARGE = 16_777_217
// The byte 0xFF never appears in UTF-8 text.
const INVALID_UTF8 = 255

// The workspace and the generated lock are written first, so a test can
// change them before the command runs.
async function prepare({
  context,
  generated,
  lock = CURRENT,
  manifests = MANIFESTS
}: Setup) {
  const workspace = await makeWorkspace({ context, lock, manifests })
  const file = path.join(workspace.folder, 'generated.lock')
  await writeFile(file, generated)
  const update = async (target = file): Promise<string[]> => {
    const lines: string[] = []
    await updateLockfileVersions({
      generated: target,
      root: workspace.root,
      log: line => {
        lines.push(line)
      }
    })
    return lines
  }
  return { ...workspace, file, update }
}

function refusal({ file, problems }: Refusal): string {
  return [
    `${file} changes more than the workspace versions of bun.lock, so nothing was written:`,
    ...problems.map(problem => `  ${problem}`),
    HELP
  ].join('\n')
}

describe('updateLockfileVersions', () => {
  it('writes nothing when the generated lock has no difference', async context => {
    const { lockfile, update } = await prepare({ context, generated: CURRENT })
    await utimes(lockfile, PAST, PAST)

    const lines = await update()

    assert.deepEqual(lines, [
      'bun.lock already matches the generated lockfile: nothing to write.'
    ])
    const stats = await stat(lockfile)
    assert.equal(stats.mtimeMs, PAST.getTime())
  })

  it('writes the generated lock when it only sets each workspace version to the one of its package.json', async context => {
    const { lockfile, update } = await prepare({ context, generated: NEXT })

    const lines = await update()

    assert.equal(await readFile(lockfile, 'utf8'), NEXT)
    assert.deepEqual(lines, [
      'Wrote bun.lock with the version of each workspace from its package.json: packages/runtime 0.1.0 -> 0.7.0, packages/tooling 0.6.0 -> 0.7.0.'
    ])
  })

  it('refuses a workspace version that differs from its package.json', async context => {
    const { file, lockfile, update } = await prepare({
      context,
      generated: renderLock({ ...RELEASED, runtime: '0.8.0' })
    })

    await assert.rejects(update(), {
      message: refusal({
        file,
        problems: [
          `line ${lineNumber({ text: CURRENT, line: RUNTIME_VERSION })}: sets the version of packages/runtime to 0.8.0, but its package.json has 0.7.0`
        ]
      })
    })
    assert.equal(await readFile(lockfile, 'utf8'), CURRENT)
  })

  it('refuses a lock with another number of lines', async context => {
    const dependency = '        "valibot": "1.5.0",'
    const { file, lockfile, update } = await prepare({
      context,
      generated: editLine({
        text: NEXT,
        from: dependency,
        to: `${dependency}\n        "zod": "4.0.0",`
      })
    })
    const lines = CURRENT.split('\n').length - 1

    await assert.rejects(update(), {
      message: `${file} has ${lines + 1} lines and bun.lock has ${lines}, so it adds or removes lines instead of changing workspace versions. Nothing was written.`
    })
    assert.equal(await readFile(lockfile, 'utf8'), CURRENT)
  })
})

describe('updateLockfileVersions lines that are not workspace versions', () => {
  const cases = [
    {
      title: 'a package resolution',
      from: '    "valibot": ["valibot@1.5.0", "", {}, "sha512-AAAA=="],',
      to: '    "valibot": ["valibot@1.5.1", "", {}, "sha512-CCCC=="],',
      reason: 'changes a line outside the workspaces section'
    },
    {
      title: 'a dependency of a workspace',
      from: '        "valibot": "1.5.0",',
      to: '        "valibot": "1.5.1",',
      reason: 'changes a line that is not the "version" of a workspace'
    },
    {
      title: 'a dependency named version, one level below the workspace fields',
      from: '        "version": "0.6.0",',
      to: '        "version": "0.7.0",',
      reason: 'changes a line that is not the "version" of a workspace'
    }
  ]

  for (const { title, from, to, reason } of cases) {
    it(`refuses a change to ${title}`, async context => {
      const { file, lockfile, update } = await prepare({
        context,
        generated: editLine({ text: NEXT, from, to })
      })

      await assert.rejects(update(), {
        message: refusal({
          file,
          problems: [
            `line ${lineNumber({ text: NEXT, line: from })}: ${reason}`
          ]
        })
      })
      assert.equal(await readFile(lockfile, 'utf8'), CURRENT)
    })
  }

  it('refuses a "version" line outside the workspaces section, even when a folder of that name has the version', async context => {
    const from = '      "version": "0.6.0",'
    const { file, lockfile, update } = await prepare({
      context,
      generated: editLine({
        text: NEXT,
        from,
        to: '      "version": "0.7.0",'
      }),
      manifests: { ...MANIFESTS, tools: '0.7.0' }
    })

    await assert.rejects(update(), {
      message: refusal({
        file,
        problems: [
          `line ${lineNumber({ text: NEXT, line: from })}: changes a line outside the workspaces section`
        ]
      })
    })
    assert.equal(await readFile(lockfile, 'utf8'), CURRENT)
  })
})

describe('updateLockfileVersions workspace folders', () => {
  it('refuses a workspace folder outside the root', async context => {
    const outside = '    "../outside": {'
    const lock = editLine({ text: CURRENT, from: RUNTIME_ENTRY, to: outside })
    const { file, folder, lockfile, update } = await prepare({
      context,
      lock,
      generated: editLine({ text: NEXT, from: RUNTIME_ENTRY, to: outside })
    })
    await writeManifest({
      folder: path.join(folder, 'outside'),
      version: RELEASED.runtime
    })

    await assert.rejects(update(), {
      message: refusal({
        file,
        problems: [
          `line ${lineNumber({ text: lock, line: RUNTIME_VERSION })}: the folder of the workspace ../outside is outside the root`
        ]
      })
    })
    assert.equal(await readFile(lockfile, 'utf8'), lock)
  })

  it('refuses a workspace folder that is a link to a folder outside the root', async context => {
    const manifests = Object.fromEntries(
      Object.entries(MANIFESTS).filter(
        ([workspace]) => workspace !== 'packages/runtime'
      )
    )
    const { file, folder, root, lockfile, update } = await prepare({
      context,
      generated: NEXT,
      manifests
    })
    const outside = path.join(folder, 'outside')
    await writeManifest({ folder: outside, version: RELEASED.runtime })
    await symlink(outside, path.join(root, 'packages/runtime'), 'dir')

    await assert.rejects(update(), {
      message: refusal({
        file,
        problems: [
          `line ${lineNumber({ text: CURRENT, line: RUNTIME_VERSION })}: the package.json of the workspace packages/runtime leads through a link to a file outside the root`
        ]
      })
    })
    assert.equal(await readFile(lockfile, 'utf8'), CURRENT)
  })
})

describe('updateLockfileVersions generated file', () => {
  it('refuses a generated lock that is a link, even to a valid lock', async context => {
    const { file, folder, lockfile, update } = await prepare({
      context,
      generated: NEXT
    })
    const link = path.join(folder, 'link.lock')
    await symlink(file, link)

    await assert.rejects(update(link), {
      message: `${link} is not a regular file, so it is not read as a lockfile. Nothing was written.`
    })
    assert.equal(await readFile(lockfile, 'utf8'), CURRENT)
  })

  it('refuses a generated lock that is a folder', async context => {
    const { folder, lockfile, update } = await prepare({
      context,
      generated: NEXT
    })
    const target = path.join(folder, 'folder.lock')
    await mkdir(target)

    await assert.rejects(update(target), {
      message: `${target} is not a regular file, so it is not read as a lockfile. Nothing was written.`
    })
    assert.equal(await readFile(lockfile, 'utf8'), CURRENT)
  })

  it('refuses a generated lock larger than 16 MiB before reading it', async context => {
    const { file, lockfile, update } = await prepare({
      context,
      generated: ''
    })
    await truncate(file, TOO_LARGE)

    await assert.rejects(update(), {
      message: `${file} has ${TOO_LARGE} bytes, more than the 16777216 a lockfile of this repository can have. Nothing was written.`
    })
    assert.equal(await readFile(lockfile, 'utf8'), CURRENT)
  })

  it('refuses a generated lock that is not UTF-8', async context => {
    const { file, lockfile, update } = await prepare({
      context,
      generated: NEXT
    })
    await writeFile(
      file,
      Buffer.concat([Buffer.from(NEXT), Buffer.from([INVALID_UTF8])])
    )

    await assert.rejects(update(), {
      message: `${file} is not UTF-8 text. Nothing was written.`
    })
    assert.equal(await readFile(lockfile, 'utf8'), CURRENT)
  })
})
