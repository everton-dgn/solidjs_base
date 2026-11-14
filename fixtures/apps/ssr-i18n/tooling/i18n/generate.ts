import { compile } from '@inlang/paraglide-js'

await compile({
  project: './project.inlang',
  outdir: './paraglide',
  emitTsDeclarations: true
})
