import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'
import { promisify } from 'node:util'

import { waitForPinnedPackages } from '../index.ts'
import { readRegistry } from '../registry.ts'
import { readPackedManifest } from '../tarball.ts'
import {
  failed,
  fakeEnvironment,
  type FakeRegistry,
  found,
  makeFolder,
  makeWorkspace,
  NOT_FOUND,
  packManifest,
  paxRecord,
  writeTarball
} from './fixtures.ts'

type Run = {
  context: TestContext
  manifest: unknown
  registry?: FakeRegistry
  readTime?: number
  timeout?: number
  workspaces?: unknown
  packages?: Record<string, string | undefined>
}

const execute = promisify(execFile)
const INTERVAL = 15_000
const ONE_MINUTE = 60_000
const SHORT_TIMEOUT = 20_000
const PACKAGES = {
  'packages/tooling': '@x/tooling',
  'packages/icons': '@x/icons',
  'packages/runtime': '@x/runtime',
  'packages/extra': '@x/extra',
  'packages/dev-only': '@x/dev-only'
}
const TOOLING = {
  name: '@x/tooling',
  version: '0.8.0',
  dependencies: { '@x/icons': '0.8.0', valibot: '1.5.0' }
}
const ICONS = '@x/icons@0.8.0'
const RUNTIME = '@x/runtime@0.8.0'

async function runWait({
  context,
  manifest,
  registry = {},
  readTime,
  timeout = ONE_MINUTE,
  workspaces = ['packages/*'],
  packages = PACKAGES
}: Run) {
  const folder = await makeFolder(context)
  const root = await makeWorkspace({ folder, workspaces, packages })
  const tarball = await packManifest({ folder, manifest })
  const fake = fakeEnvironment({ registry, readTime })
  const result = waitForPinnedPackages({
    tarball,
    root,
    timing: { interval: INTERVAL, timeout },
    environment: fake.environment
  })
  return { ...fake, result }
}

describe('waitForPinnedPackages', () => {
  it('passes without a call to npm when the tarball pins no package of this repository', async context => {
    const { result, calls, lines } = await runWait({
      context,
      manifest: {
        name: '@x/runtime',
        version: '0.8.0',
        dependencies: { valibot: '1.5.0' },
        devDependencies: { '@x/dev-only': '0.8.0' }
      }
    })

    await result
    assert.deepEqual(calls, [])
    assert.deepEqual(lines, [
      '@x/runtime@0.8.0 pins no package of this repository in dependencies, optionalDependencies, peerDependencies: nothing to wait for.'
    ])
  })

  it('waits until npm has the pinned version, asking the registry each time', async context => {
    const { result, calls, lines, sleeps } = await runWait({
      context,
      manifest: TOOLING,
      registry: { [ICONS]: [NOT_FOUND, NOT_FOUND, found('0.8.0')] }
    })

    await result
    const call = {
      file: 'npm',
      args: ['view', ICONS, 'version', '--json', '--prefer-online'],
      isWrite: false
    }
    assert.deepEqual(calls, [
      { ...call, timeout: ONE_MINUTE },
      { ...call, timeout: ONE_MINUTE - INTERVAL },
      { ...call, timeout: ONE_MINUTE - INTERVAL - INTERVAL }
    ])
    assert.deepEqual(sleeps, [INTERVAL, INTERVAL])
    assert.deepEqual(lines, [
      '@x/tooling@0.8.0 pins @x/icons@0.8.0 in dependencies. Waiting up to 1 minute(s) for npm to have them.',
      '  @x/icons@0.8.0 is not on npm yet. Reading again in 15 second(s).',
      '  @x/icons@0.8.0 is not on npm yet. Reading again in 15 second(s).',
      '@x/icons@0.8.0 is on npm.'
    ])
  })

  it('waits for the packages of this repository in dependencies, optionalDependencies and peerDependencies only', async context => {
    const { result, calls } = await runWait({
      context,
      manifest: {
        ...TOOLING,
        optionalDependencies: { '@x/extra': '0.8.0' },
        peerDependencies: { '@x/runtime': '0.8.0', 'vite-plus': '1.6.0' },
        devDependencies: { '@x/dev-only': '0.8.0', '@x/runtime': '0.8.0' }
      },
      registry: {
        [ICONS]: [found('0.8.0')],
        '@x/extra@0.8.0': [found('0.8.0')],
        [RUNTIME]: [found('0.8.0')]
      }
    })

    await result
    assert.deepEqual(
      calls.map(({ args }) => args[1]),
      [ICONS, '@x/extra@0.8.0', RUNTIME]
    )
  })

  it('reads again only the versions that are still missing', async context => {
    const { result, calls } = await runWait({
      context,
      manifest: { ...TOOLING, peerDependencies: { '@x/runtime': '0.8.0' } },
      registry: {
        [ICONS]: [NOT_FOUND, found('0.8.0')],
        [RUNTIME]: [found('0.8.0')]
      }
    })

    await result
    assert.deepEqual(
      calls.map(({ args }) => args[1]),
      [ICONS, RUNTIME, ICONS]
    )
  })

  it('reads a version pinned in two sections once', async context => {
    const { result, calls } = await runWait({
      context,
      manifest: { ...TOOLING, peerDependencies: { '@x/icons': '0.8.0' } },
      registry: { [ICONS]: [found('0.8.0')] }
    })

    await result
    assert.deepEqual(
      calls.map(({ args }) => args[1]),
      [ICONS]
    )
  })

  it('reads again after an npm call that failed or was stopped', async context => {
    const stopped = {
      exitCode: 124,
      stdout: '',
      stderr: 'npm view did not finish within 1 minute(s) and was stopped.'
    }
    const { result, lines } = await runWait({
      context,
      manifest: TOOLING,
      registry: {
        [ICONS]: [stopped, failed('npm error code ECONNRESET'), found('0.8.0')]
      }
    })

    await result
    assert.deepEqual(lines.slice(1), [
      '  npm view did not finish within 1 minute(s) and was stopped. Reading again in 15 second(s).',
      '  npm error code ECONNRESET. Reading again in 15 second(s).',
      '@x/icons@0.8.0 is on npm.'
    ])
  })
})

describe('waitForPinnedPackages time limit', () => {
  it('fails at the time limit with the missing version and what to do', async context => {
    const { result, calls, sleeps } = await runWait({
      context,
      manifest: TOOLING
    })

    await assert.rejects(result, {
      message: [
        '@x/icons@0.8.0 did not appear on npm within 1 minute(s) (@x/icons@0.8.0 is not on npm yet).',
        '@x/tooling@0.8.0 pins it in dependencies, so it was not published: it would install nothing until npm has that version.',
        'Publish @x/icons@0.8.0 first. When its publish job in this run failed, fix the cause, such as a trusted publisher missing on npm, and choose "Re-run failed jobs", which runs this wait again (docs/releasing.md#when-the-publish-job-fails).'
      ].join('\n')
    })
    assert.equal(calls.length, ONE_MINUTE / INTERVAL)
    assert.equal(
      sleeps.reduce((total, sleep) => total + sleep, 0),
      ONE_MINUTE
    )
  })

  it('shortens the last pause to the time left', async context => {
    const { result, sleeps } = await runWait({
      context,
      manifest: TOOLING,
      timeout: SHORT_TIMEOUT
    })

    await assert.rejects(result)
    assert.deepEqual(sleeps, [INTERVAL, SHORT_TIMEOUT - INTERVAL])
  })

  it('gives each read the time left and reads nothing at the time limit', async context => {
    const readTime = 20_000
    const { result, calls, environment } = await runWait({
      context,
      manifest: TOOLING,
      readTime
    })

    await assert.rejects(result, {
      message: /^@x\/icons@0\.8\.0 did not appear on npm within 1 minute\(s\)/u
    })
    assert.deepEqual(
      calls.map(({ timeout }) => timeout),
      [ONE_MINUTE, ONE_MINUTE - readTime - INTERVAL]
    )
    assert.equal(environment.now(), ONE_MINUTE)
  })

  it('stops in the middle of the reads at the time limit and names the versions left', async context => {
    const readTime = 40_000
    const { result, calls, environment } = await runWait({
      context,
      manifest: {
        ...TOOLING,
        optionalDependencies: { '@x/extra': '0.8.0' },
        peerDependencies: { '@x/runtime': '0.8.0' }
      },
      readTime
    })

    await assert.rejects(result, {
      message:
        /^@x\/icons@0\.8\.0, @x\/extra@0\.8\.0, @x\/runtime@0\.8\.0 did not appear on npm within 1 minute\(s\) \(@x\/icons@0\.8\.0 is not on npm yet; @x\/extra@0\.8\.0 is not on npm yet; @x\/runtime@0\.8\.0 was not read before the time limit\)\./u
    })
    assert.deepEqual(
      calls.map(({ args, timeout }) => [args[1], timeout]),
      [
        [ICONS, ONE_MINUTE],
        ['@x/extra@0.8.0', ONE_MINUTE - readTime]
      ]
    )
    assert.equal(environment.now(), ONE_MINUTE)
  })

  it('does not take another version for the pinned one', async context => {
    const { result } = await runWait({
      context,
      manifest: TOOLING,
      registry: { [ICONS]: [found('0.7.0')] }
    })

    await assert.rejects(result, {
      message:
        /\(npm view @x\/icons@0\.8\.0 printed \["0\.7\.0"\], not 0\.8\.0\)\./u
    })
  })
})

describe('waitForPinnedPackages refusals', () => {
  for (const version of ['workspace:*', '^0.8.0', 'catalog:']) {
    it(`refuses a pin written as ${version}, without a call to npm`, async context => {
      const { result, calls } = await runWait({
        context,
        manifest: { ...TOOLING, dependencies: { '@x/icons': version } }
      })

      await assert.rejects(result, {
        message: `@x/tooling@0.8.0 pins @x/icons as ${JSON.stringify(version)} in dependencies, not as an exact version, so there is no version to wait for. Declare it as "workspace:*" and pack with vp pm pack, as the publish job does.`
      })
      assert.deepEqual(calls, [])
    })
  }

  it('refuses the tarball of a package that is not in the workspace', async context => {
    const { result, calls } = await runWait({
      context,
      manifest: { ...TOOLING, name: '@other/tooling' }
    })

    await assert.rejects(result, {
      message: /^@other\/tooling is not a package of this repository/u
    })
    assert.deepEqual(calls, [])
  })

  it('leaves out a workspace without a name, which no package can pin', async context => {
    const { result, calls } = await runWait({
      context,
      manifest: TOOLING,
      registry: { [ICONS]: [found('0.8.0')] },
      workspaces: ['packages/*', 'apps/*'],
      packages: { ...PACKAGES, 'apps/site': undefined }
    })

    await result
    assert.deepEqual(
      calls.map(({ args }) => args[1]),
      [ICONS]
    )
  })

  it('refuses the tarball of a workspace without a name', async context => {
    const { result, calls } = await runWait({
      context,
      manifest: { ...TOOLING, name: '@x/site' },
      workspaces: ['packages/*', 'apps/*'],
      packages: { ...PACKAGES, 'apps/site': undefined }
    })

    await assert.rejects(result, {
      message: /^@x\/site is not a package of this repository/u
    })
    assert.deepEqual(calls, [])
  })

  it('refuses a workspace root whose packages have no name', async context => {
    const { result } = await runWait({
      context,
      manifest: TOOLING,
      packages: { 'packages/site': undefined }
    })

    await assert.rejects(result, {
      message: /match no package\.json with a name/u
    })
  })

  it('refuses a workspace root that lists no package', async context => {
    const { result } = await runWait({
      context,
      manifest: TOOLING,
      packages: {}
    })

    await assert.rejects(result, { message: /match no package\.json/u })
  })

  it('refuses a workspace root whose workspaces is not a list', async context => {
    const { result } = await runWait({
      context,
      manifest: TOOLING,
      workspaces: 'packages/*'
    })

    await assert.rejects(result, { message: /has no workspaces list/u })
  })
})

describe('waitForPinnedPackages registry', () => {
  for (const stdout of [
    '"0.8.0"',
    '["0.7.0","0.8.0"]',
    '{"version":"0.8.0"}'
  ]) {
    it(`reads the version printed as ${stdout}`, async () => {
      const reading = await readRegistry({
        run: () => Promise.resolve({ exitCode: 0, stdout, stderr: '' }),
        name: '@x/icons',
        version: '0.8.0',
        timeout: ONE_MINUTE
      })

      assert.deepEqual(reading, { isPublished: true, detail: undefined })
    })
  }

  it('counts an empty answer as a missing version', async () => {
    const reading = await readRegistry({
      run: () => Promise.resolve({ exitCode: 0, stdout: '\n', stderr: '' }),
      name: '@x/icons',
      version: '0.8.0',
      timeout: ONE_MINUTE
    })

    assert.equal(reading.isPublished, false)
  })

  it('counts an answer that is not JSON as a missing version', async () => {
    const reading = await readRegistry({
      run: () =>
        Promise.resolve({ exitCode: 0, stdout: 'npm warn', stderr: '' }),
      name: '@x/icons',
      version: '0.8.0',
      timeout: ONE_MINUTE
    })

    assert.deepEqual(reading, {
      isPublished: false,
      detail: 'npm view @x/icons@0.8.0 is not valid JSON.'
    })
  })
})

describe('waitForPinnedPackages tarball', () => {
  it('finds the package.json after a folder, other files and a pax header', async context => {
    const tarball = await writeTarball({
      folder: await makeFolder(context),
      entries: [
        { name: 'package/', type: '5' },
        { name: 'package/._package.json', content: 'resource fork' },
        { name: 'package/README.md', content: '# readme' },
        {
          name: 'PaxHeader',
          type: 'x',
          content: paxRecord('package/package.json')
        },
        { name: 'package/package.j', content: '{"name":"@x/icons"}' }
      ]
    })

    assert.deepEqual(await readPackedManifest(tarball), { name: '@x/icons' })
  })

  it('reads a tarball that npm packs', async context => {
    const folder = await makeFolder(context)
    const source = path.join(folder, 'source')
    const destination = path.join(folder, 'packed')
    await Promise.all([mkdir(source), mkdir(destination)])
    const manifest = {
      name: '@x/tooling',
      version: '0.8.0',
      dependencies: { '@x/icons': '0.8.0' }
    }
    await writeFile(path.join(source, 'package.json'), JSON.stringify(manifest))
    await execute(
      'npm',
      ['pack', source, '--pack-destination', destination, '--silent'],
      { cwd: destination }
    )
    const [packed = ''] = await readdir(destination)

    assert.deepEqual(
      await readPackedManifest(path.join(destination, packed)),
      manifest
    )
  })

  it('refuses a tarball without package/package.json', async context => {
    const tarball = await writeTarball({
      folder: await makeFolder(context),
      entries: [{ name: 'other/package.json', content: '{}' }]
    })

    await assert.rejects(readPackedManifest(tarball), {
      message: `${tarball} has no package/package.json.`
    })
  })

  it('refuses a tarball whose package/package.json is not a regular file', async context => {
    const tarball = await writeTarball({
      folder: await makeFolder(context),
      entries: [
        { name: 'package/', type: '5' },
        { name: 'package/package.json', type: '2' }
      ]
    })

    await assert.rejects(readPackedManifest(tarball), {
      message: `${tarball} has no package/package.json.`
    })
  })

  it('refuses a file that is not gzip', async context => {
    const file = path.join(await makeFolder(context), 'plain.tgz')
    await writeFile(file, 'not gzip')

    await assert.rejects(readPackedManifest(file), {
      message: `${file} is not a gzip file.`
    })
  })
})
