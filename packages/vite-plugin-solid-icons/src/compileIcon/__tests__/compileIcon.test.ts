import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { compileIcon } from '../index.ts'

describe('compileIcon', () => {
  it('spreads the props on the root element of a component', () => {
    const code = compileIcon({
      svg: '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>',
      isRaw: false,
      icon: 'own/star'
    })

    assert.equal(
      code,
      'export default (props = {}) => <svg viewBox="0 0 24 24" {...props}><path d="M0 0"/></svg>\n'
    )
  })

  it('writes text with braces as a string', () => {
    const code = compileIcon({
      svg: '<svg><style>.a{fill:red}</style></svg>',
      isRaw: false,
      icon: 'own/star'
    })

    assert.match(code, /<style>\{".a\{fill:red\}"\}<\/style>/u)
  })

  it('exports the SVG text of a raw import', () => {
    const svg = '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>'

    assert.equal(
      compileIcon({ svg, isRaw: true, icon: 'own/star' }),
      `export default ${JSON.stringify(svg)}\n`
    )
  })
})
