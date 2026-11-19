import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'

import {
  CSP_DIRECTIVES,
  SECURITY_HEADERS
} from '../../solid-runtime/src/middleware/securityHeaders/constants.js'

const timeout = 30_000
const missing = 404
const methodNotAllowed = 405

void it('serves published files and a missing error page with the host contract', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'solid-host-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const root = path.join(dir, '.output/public')
  mkdirSync(root, { recursive: true })
  const mime = {
    'page.md': 'text/markdown; charset=utf-8',
    'health.txt': 'text/plain; charset=utf-8',
    'logo.png': 'image/png',
    'favicon.ico': 'image/x-icon'
  }
  for (const name of ['index.html', 'extra.html', ...Object.keys(mime)]) {
    writeFileSync(path.join(root, name), name)
  }
  const hash = 'sha256-example'
  writeFileSync(
    path.join(dir, '.output/csp-hashes.json'),
    JSON.stringify({ pages: { '/index.html': [hash] } })
  )
  symlinkSync(
    path.resolve('../../apps/boilerplate/node_modules'),
    path.join(dir, 'node_modules'),
    'dir'
  )
  cpSync(
    'dist/static/files/tooling/testing/serve-public.ts',
    path.join(dir, 'serve.ts')
  )
  // Report the port allocated by the OS from the child that owns the listener.
  const wrapper = path.join(dir, 'start.mjs')
  writeFileSync(
    wrapper,
    `import { Server } from 'node:net'
const listen = Server.prototype.listen
Server.prototype.listen = function (...args) {
  this.once('listening', () => process.send(this.address().port))
  return listen.apply(this, args)
}
await import('./serve.ts')
`
  )
  const child = fork(wrapper, {
    cwd: dir,
    env: { PORT: '0' },
    execArgv: []
  })
  const exited = once(child, 'exit')
  try {
    const message: unknown = await once(child, 'message', {
      signal: AbortSignal.timeout(timeout)
    })
    assert.ok(Array.isArray(message))
    const port: unknown = message[0]
    assert.ok(typeof port === 'number')
    const origin = `http://127.0.0.1:${String(port)}`
    const page = await fetch(origin)
    assert.equal(await page.text(), 'index.html')
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      assert.equal(page.headers.get(name), value)
    }
    assert.equal(
      page.headers.get('content-security-policy'),
      [...CSP_DIRECTIVES, `script-src 'self' '${hash}'`].join('; ')
    )
    for (const [file, type] of Object.entries(mime)) {
      const response = await fetch(new URL(file, origin), { method: 'HEAD' })
      assert.equal(response.headers.get('content-type'), type)
      assert.equal(await response.text(), '')
    }
    const extra = await fetch(new URL('extra.html', origin))
    assert.equal(await extra.text(), 'extra.html')
    assert.equal(
      extra.headers.get('content-security-policy'),
      [...CSP_DIRECTIVES, "script-src 'self'"].join('; ')
    )
    const post = await fetch(origin, { method: 'POST' })
    assert.equal(post.status, methodNotAllowed)
    assert.equal(post.headers.get('allow'), 'GET, HEAD')
    const absent = await fetch(new URL('absent', origin))
    assert.equal(absent.status, missing)
    assert.equal(await absent.text(), '')
  } finally {
    child.kill()
    await exited
  }
})
