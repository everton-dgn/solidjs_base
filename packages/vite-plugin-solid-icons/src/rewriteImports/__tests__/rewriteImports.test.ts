import assert from 'node:assert/strict'
import { SourceMap } from 'node:module'
import { describe, it } from 'node:test'

import { buildNameTable, exportedIcon } from '../../iconNames/index.ts'
import {
  importError,
  type ImportError,
  isImportError
} from '../../importErrors/index.ts'
import { type ExportRequest, rewriteImports } from '../index.ts'

type RewriteCase = { code: string; id?: string }

const TABLES = new Map([
  [
    'hugeicons',
    buildNameTable({
      icons: [
        'github',
        'arrow-left-01',
        'arrow-down-01',
        'arrow-down01',
        '3d-move',
        'printer-3d'
      ],
      aliases: { 'three-d-printer': 'printer-3d' }
    })
  ],
  ['own', buildNameTable({ icons: ['star', 'dot-01'], aliases: {} })]
])

function resolveIcon({
  collection,
  exportName,
  position
}: ExportRequest): Promise<string> {
  const table = TABLES.get(collection)
  assert.ok(table, `no table for ${collection}`)
  try {
    return Promise.resolve(exportedIcon({ table, collection, exportName }))
  } catch (error) {
    assert.ok(error instanceof Error)
    return Promise.reject(importError({ message: error.message, position }))
  }
}

async function rewrite({
  code,
  id = '/src/App.tsx'
}: RewriteCase): Promise<string | undefined> {
  const result = await rewriteImports({ code, id, resolveIcon })
  return result?.code
}

async function rewriteError({
  code,
  id = '/src/App.tsx'
}: RewriteCase): Promise<ImportError> {
  let failure: unknown
  try {
    await rewriteImports({ code, id, resolveIcon })
  } catch (error) {
    failure = error
  }
  assert.ok(
    isImportError(failure),
    'the rewrite throws an error with a position'
  )
  return failure
}

describe('rewriteImports', () => {
  it('imports each named icon by its path', async () => {
    assert.equal(
      await rewrite({
        code: "import { Github, ArrowLeft01 as Back } from 'icon:hugeicons'\n"
      }),
      'import Github from "icon:hugeicons/github"; import Back from "icon:hugeicons/arrow-left-01";\n'
    )
  })

  it('reads an import over several lines with a comment', async () => {
    const code = `import {
  Github,
  // the arrow of the back button
  ArrowLeft01,
} from "icon:hugeicons";
const x = 1
`

    assert.equal(
      await rewrite({ code }),
      'import Github from "icon:hugeicons/github"; import ArrowLeft01 from "icon:hugeicons/arrow-left-01";\nconst x = 1\n'
    )
  })

  it('keeps an import type as written', async () => {
    const code = "import type { Github } from 'icon:hugeicons'\n"

    assert.equal(await rewrite({ code }), undefined)
  })

  it('moves the type specifiers to an import type', async () => {
    assert.equal(
      await rewrite({
        code: "import { type Github, type Star as S, ArrowLeft01 } from 'icon:hugeicons'"
      }),
      'import type { Github, Star as S } from \'icon:hugeicons\'; import ArrowLeft01 from "icon:hugeicons/arrow-left-01";'
    )
    assert.equal(
      await rewrite({ code: "import { type Github } from 'icon:hugeicons'" }),
      "import type { Github } from 'icon:hugeicons';"
    )
  })

  it('exports named icons from their paths', async () => {
    assert.equal(
      await rewrite({
        code: "export { Github, ArrowLeft01 as Back, type Star } from 'icon:hugeicons'"
      }),
      'export type { Star } from \'icon:hugeicons\'; export { default as Github } from "icon:hugeicons/github"; export { default as Back } from "icon:hugeicons/arrow-left-01";'
    )
  })

  it('keeps an export type as written', async () => {
    const code = "export type { Github } from 'icon:hugeicons'"

    assert.equal(await rewrite({ code }), undefined)
  })

  it('reads the names that start with a digit, the aliases and the strict names', async () => {
    assert.equal(
      await rewrite({
        code: "import { Icon3dMove, ThreeDPrinter, ArrowDown_01 } from 'icon:hugeicons'"
      }),
      'import Icon3dMove from "icon:hugeicons/3d-move"; import ThreeDPrinter from "icon:hugeicons/printer-3d"; import ArrowDown_01 from "icon:hugeicons/arrow-down-01";'
    )
  })

  it('reads a folder collection', async () => {
    assert.equal(
      await rewrite({ code: "import { Star, Dot01 } from 'icon:own'" }),
      'import Star from "icon:own/star"; import Dot01 from "icon:own/dot-01";'
    )
  })

  it('leaves the text of an import in a string or a comment', async () => {
    const code = `const a = "import { Githb } from 'icon:hugeicons'"
// import { Githb } from 'icon:hugeicons'
/* export { Githb } from 'icon:hugeicons' */
const b = \`import('icon:hugeicons')\`
`

    assert.equal(await rewrite({ code }), undefined)
  })

  it('imports the same icon of two modules from one path', async () => {
    const first = await rewrite({
      code: "import { Github } from 'icon:hugeicons'",
      id: '/src/Header.tsx'
    })
    const second = await rewrite({
      code: "import { Github as Logo } from 'icon:hugeicons'",
      id: '/src/Footer.jsx'
    })

    assert.match(first ?? '', /from "icon:hugeicons\/github"/u)
    assert.match(second ?? '', /from "icon:hugeicons\/github"/u)
  })

  it('leaves the other imports, the per icon imports and a module with a syntax error', async () => {
    assert.equal(
      await rewrite({
        code: "import Github from 'icon:hugeicons/github'\nimport { a } from './a'"
      }),
      undefined
    )
    assert.equal(
      await rewrite({
        code: "import { Github } from 'icon:hugeicons'\nconst ="
      }),
      undefined
    )
  })

  it('maps the rewritten code to the source', async () => {
    const code =
      "import { Github, ArrowLeft01 } from 'icon:hugeicons'; export const a = Github\n"
    const result = await rewriteImports({
      code,
      id: '/src/App.ts',
      resolveIcon
    })

    assert.ok(result)
    assert.deepEqual(result.map.sources, ['/src/App.ts'])
    assert.deepEqual(result.map.sourcesContent, [code])
    const map = new SourceMap({
      version: result.map.version,
      file: '',
      sourceRoot: '',
      sources: result.map.sources,
      sourcesContent: [code],
      names: result.map.names,
      mappings: result.map.mappings
    })
    const originalPosition = (generatedColumn: number) => {
      const entry = map.findEntry(0, generatedColumn)
      assert.ok('originalColumn' in entry)
      return [entry.originalLine, entry.originalColumn]
    }
    assert.deepEqual(originalPosition(result.code.indexOf('export')), [
      0,
      code.indexOf('export')
    ])
    assert.deepEqual(originalPosition(result.code.lastIndexOf('Github')), [
      0,
      code.lastIndexOf('Github')
    ])
  })

  it('names a missing icon and suggests the closest name', async () => {
    const code = "import { Github, Githb } from 'icon:hugeicons'"
    const error = await rewriteError({ code })

    assert.equal(
      error.message,
      `"Githb" is not an icon of 'icon:hugeicons'. Did you mean Github?`
    )
    assert.equal(error.position, code.indexOf('Githb'))
  })

  it('lists the strict names and the import by path of an ambiguous name', async () => {
    const error = await rewriteError({
      code: "import { ArrowDown01 } from 'icon:hugeicons'"
    })

    assert.equal(
      error.message,
      `"ArrowDown01" names more than one icon of 'icon:hugeicons': import ArrowDown_01 for arrow-down-01, or 'icon:hugeicons/arrow-down01' for arrow-down01.`
    )
  })

  it('refuses the imports of a whole collection', async () => {
    const cases = [
      ["import * as Icons from 'icon:hugeicons'", 'A namespace import'],
      ["import Icons from 'icon:hugeicons'", 'A default import'],
      ["import Icons, { Github } from 'icon:hugeicons'", 'A default import'],
      ["import 'icon:hugeicons'", "import 'icon:hugeicons' is not supported"],
      ["export {} from 'icon:hugeicons'", "import 'icon:hugeicons' is not"],
      ["export * from 'icon:hugeicons'", 'export * from'],
      ["export * as Icons from 'icon:hugeicons'", 'export * from'],
      [
        "export async function load() { return import('icon:hugeicons') }",
        "import('icon:hugeicons') is not supported"
      ]
    ]
    for (const [code = '', start = ''] of cases) {
      const error = await rewriteError({ code })

      assert.ok(error.message.startsWith(start), `${code}: ${error.message}`)
      assert.match(
        error.message,
        /'icon:hugeicons\/<name>'/u,
        'the error shows the import by path'
      )
    }
  })
})
