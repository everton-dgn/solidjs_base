import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { compileIcon } from '../index.ts'

describe('compileIcon', () => {
  it('spreads the props on the root element of a component', () => {
    const code = compileIcon({
      svg: '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>',
      isRaw: false
    })

    assert.equal(
      code,
      'export default (props = {}) => <svg viewBox="0 0 24 24" {...props}><path d="M0 0"/></svg>\n'
    )
  })

  it('keeps braces of the markup as text', () => {
    const code = compileIcon({
      svg: '<svg><style>.a{fill:red}</style></svg>',
      isRaw: false
    })

    assert.match(code, /<style>\.a\{'\{'\}fill:red\{'\}'\}<\/style>/u)
  })

  it('exports the SVG text of a raw import', () => {
    const svg = '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>'

    assert.equal(
      compileIcon({ svg, isRaw: true }),
      `export default ${JSON.stringify(svg)}\n`
    )
  })
})
