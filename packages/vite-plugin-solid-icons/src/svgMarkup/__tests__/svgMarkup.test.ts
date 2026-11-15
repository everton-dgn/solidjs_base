import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { compileIcon } from '../../compileIcon/index.ts'

type Refusal = { svg: string; message: RegExp }

function component(svg: string): string {
  return compileIcon({ svg, isRaw: false, icon: 'own/test' })
}

function raw(svg: string): string {
  return compileIcon({ svg, isRaw: true, icon: 'own/test' })
}

const CODE: Refusal[] = [
  {
    svg: '<svg><script>alert(1)</script></svg>',
    message: /the SVG has a <script> element, which runs code/u
  },
  {
    svg: '<svg><svg:SCRIPT>alert(1)</svg:SCRIPT></svg>',
    message: /the SVG has a <svg:SCRIPT> element, which runs code/u
  },
  {
    svg: '<svg onload="alert(1)"><path d="M0"/></svg>',
    message: /the attribute onload of <svg> is an event handler/u
  },
  {
    svg: '<svg><path ONCLICK="alert(1)"/></svg>',
    message: /the attribute ONCLICK of <path> is an event handler/u
  },
  {
    svg: '<svg><a href="javascript:alert(1)"><path/></a></svg>',
    message: /the attribute href of <a> is a script URL/u
  },
  {
    svg: '<svg><a xlink:href=" JaVaScRiPt:alert(1)"><path/></a></svg>',
    message: /the attribute xlink:href of <a> is a script URL/u
  },
  {
    svg: '<svg><a href="&#106;ava&#x09;script&#58;alert(1)"><path/></a></svg>',
    message: /the attribute href of <a> is a script URL/u
  },
  {
    svg: '<svg><a href="vbscript:msgbox(1)"><path/></a></svg>',
    message: /the attribute href of <a> is a script URL/u
  },
  {
    svg: '<svg><a><set attributeName="href" to="javascript:alert(1)"/></a></svg>',
    message: /the attribute to of <set> is a script URL/u
  },
  {
    svg: '<svg><foreignObject><img src="x"/></foreignObject></svg>',
    message: /the SVG has a <foreignObject> element, which embeds HTML/u
  }
]

const JSX_CODE: Refusal[] = [
  {
    svg: '<svg><window.alert/></svg>',
    message: /the element <window\.alert> is not an element in JSX/u
  },
  {
    svg: '<svg><Text/></svg>',
    message: /the element <Text> is not an element in JSX/u
  },
  {
    svg: '<svg><svg:path/></svg>',
    message: /the element <svg:path> is not an element in JSX/u
  },
  {
    svg: '<svg><g prop:innerHTML="x"/></svg>',
    message: /the attribute prop:innerHTML of <g> is not an attribute in JSX/u
  },
  {
    svg: '<svg><g innerHTML="x"/></svg>',
    message: /the attribute innerHTML of <g> is not an attribute in JSX/u
  },
  {
    svg: '<svg><g children="x"/></svg>',
    message: /the attribute children of <g> is not an attribute in JSX/u
  },
  {
    svg: '<svg><g ref="alert"/></svg>',
    message: /the attribute ref of <g> is not an attribute in JSX/u
  },
  {
    svg: '<svg><g use:alert="1"/></svg>',
    message: /the attribute use:alert of <g> is not an attribute in JSX/u
  },
  {
    svg: '<svg><g data.x="1"/></svg>',
    message: /the attribute data\.x of <g> is not an attribute in JSX/u
  }
]

const MALFORMED: Refusal[] = [
  { svg: '<g/>', message: /the file has no <svg> root element/u },
  { svg: '<svgx/>', message: /the file has no <svg> root element/u },
  { svg: '<svg><g><path/></svg>', message: /<\/svg> closes <g>/u },
  { svg: '<svg><path/>', message: /<svg> is not closed/u },
  { svg: '<svg><path d=M0/></svg>', message: /has no quoted value/u },
  { svg: '<svg><path d="a<b"/></svg>', message: /has a "<"/u },
  {
    svg: '<svg><path d="1"d="2"/></svg>',
    message: /are not separated by spaces/u
  },
  {
    svg: '<svg><path d="1" d="2"/></svg>',
    message: /appears twice on <path>/u
  },
  { svg: '<svg></svg>trailing', message: /content follows the root element/u },
  { svg: '<svg><!-- open</svg>', message: /a <!-- is not closed/u },
  {
    svg: '<svg><text>a & b</text></svg>',
    message: /a "&" starts no reference/u
  },
  {
    svg: '<svg><text>&nbsp;</text></svg>',
    message: /&nbsp; is not an XML entity/u
  },
  // An entity of a DOCTYPE, as in an external entity or a chain of
  // entities: the plugin reads no DOCTYPE, so no entity expands.
  {
    svg: '<svg><text>&xxe;</text></svg>',
    message: /&xxe; is not an XML entity/u
  },
  { svg: '<svg><text>&#0;</text></svg>', message: /&#0; is not a character/u },
  {
    svg: '<svg><!ENTITY a "b"><text/></svg>',
    message: /a <! declaration sits inside the root element/u
  },
  {
    svg: '<svg>a ]]> b</svg>',
    message: /a "\]\]>" sits outside a CDATA section/u
  }
]

describe('the markup of an icon', () => {
  it('refuses the markup that runs code, also as raw text', () => {
    for (const { svg, message } of CODE) {
      assert.throws(() => component(svg), message, svg)
      assert.throws(() => raw(svg), message, svg)
    }
  })

  it('refuses the markup that JSX reads as code', () => {
    for (const { svg, message } of JSX_CODE) {
      assert.throws(() => component(svg), message, svg)
      assert.throws(() => component(svg), /import the icon with \?raw/u, svg)
      assert.doesNotThrow(() => raw(svg), svg)
    }
  })

  it('names the icon and the problem of a malformed SVG', () => {
    for (const { svg, message } of MALFORMED) {
      assert.throws(() => component(svg), message, svg)
      assert.throws(() => component(svg), /^Error: Icon "own\/test": /u, svg)
    }
  })

  it('writes text and values with markup characters as strings', () => {
    const code = component(
      `<svg><text x="a{b}">{globalThis.pwned = 1} a > b &amp; &lt;i&gt; &apos;</text><style><![CDATA[.a > .b { fill: red }]]></style><path d="&#77;0" title='say "hi"'/></svg>`
    )

    assert.equal(
      code,
      `export default (props = {}) => <svg {...props}><text x="a{b}">{"{globalThis.pwned = 1} a > b & <i> '"}</text><style>{".a > .b { fill: red }"}</style><path d={"M0"} title={"say \\"hi\\""}/></svg>\n`
    )
  })

  it('leaves out comments and instructions, and keeps them as raw text', () => {
    const svg = '<svg><!-- a <b> --><?pi x?><path d="M0"/></svg><!-- end -->'

    assert.equal(
      component(svg),
      'export default (props = {}) => <svg {...props}><path d="M0"/></svg>\n'
    )
    assert.equal(raw(svg), `export default ${JSON.stringify(svg)}\n`)
  })

  it('keeps the first of a repeated attribute of the root', () => {
    const svg =
      '<svg aria-hidden="true" viewBox="0 0 1 1" aria-hidden="false"><path/></svg>'

    assert.equal(
      component(svg),
      'export default (props = {}) => <svg aria-hidden="true" viewBox="0 0 1 1" {...props}><path/></svg>\n'
    )
    assert.equal(
      raw(svg),
      `export default ${JSON.stringify('<svg aria-hidden="true" viewBox="0 0 1 1"><path/></svg>')}\n`
    )
  })

  it('reads a deep markup without running out of stack', () => {
    const depth = 50_000
    const svg = `<svg>${'<g>'.repeat(depth)}${'</g>'.repeat(depth)}</svg>`

    assert.match(
      component(svg),
      /^export default \(props = \{\}\) => <svg \{\.\.\.props\}><g>/u
    )
  })
})
