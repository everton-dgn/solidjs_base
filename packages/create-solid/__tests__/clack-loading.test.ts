import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { it } from 'node:test'

// Writes to the standard error each module of @clack/core that the process loads.
const hook = `
import { writeSync } from 'node:fs'
import { registerHooks } from 'node:module'
registerHooks({
  load(url, context, nextLoad) {
    if (url.includes('/@clack/core/')) writeSync(2, 'loaded ' + url + '\\n')
    return nextLoad(url, context)
  }
})
`
void it('loads no module of Clack core on a run with no terminal', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'solid-clack-'))
  try {
    const child = spawnSync(
      process.execPath,
      [
        `--import=data:text/javascript,${encodeURIComponent(hook)}`,
        'src/create-solid.ts',
        path.join(dir, 'app'),
        '--yes',
        '--no-install',
        '--no-git'
      ],
      { encoding: 'utf8' }
    )
    assert.equal(child.status, 0, child.stderr)
    assert.doesNotMatch(child.stderr, /loaded /u)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
