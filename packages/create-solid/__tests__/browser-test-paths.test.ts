import assert from 'node:assert/strict'
import { it } from 'node:test'

import { prepareBrowserPaths } from '../tooling/browser-test-paths.ts'

void it('derives literal, template and regex paths from configured locale roles', () => {
  const text = [
    "const path = '/en/about'",
    `const url = \`/pt/\${slug}\``,
    String.raw`const match = /\/es\?filter/u`,
    "const other = '/entry'"
  ].join('\n')
  const result = prepareBrowserPaths('Home.e2e.test.ts', text)
  assert.ok(result.includes(`\`/\${testLanguages.base}/about\``))
  assert.ok(result.includes(`\`/\${testLanguages.alternate}/\${slug}\``))
  assert.ok(result.includes('new RegExp(String.raw'))
  assert.ok(result.includes('testLanguages.third'))
  assert.ok(result.includes("const other = '/entry'"))
})

void it('passes locale values into Playwright callbacks executed in the browser', () => {
  const result = prepareBrowserPaths(
    'I18n.redirect.e2e.test.ts',
    "await page.evaluate(() => history.pushState(null, '', '/pt/route'))"
  )
  assert.match(result, /page\.evaluate\(pageLanguages =>/u)
  assert.match(result, /base: testLanguages\.base/u)
})
