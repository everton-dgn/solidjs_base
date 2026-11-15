import { isSvgError, parseSvg, svgJsx, svgText } from '../svgMarkup/index.ts'

type CompileInput = {
  svg: string
  isRaw: boolean
  // The icon as an import names it, as in own/star, for the error.
  icon: string
}

// The module goes through the Solid plugin as TSX, so the compiler of the
// installed Solid version writes the DOM and the SSR output. The markup is
// written again from what the SVG parses to, so no text of the file becomes
// code of the module.
function moduleCode({ svg, isRaw }: CompileInput): string {
  const parsed = parseSvg({ svg, isComponent: !isRaw })
  return isRaw
    ? `export default ${JSON.stringify(svgText({ svg, parsed }))}\n`
    : `export default (props = {}) => ${svgJsx(parsed.root)}\n`
}

export function compileIcon(input: CompileInput): string {
  try {
    return moduleCode(input)
  } catch (error) {
    if (!isSvgError(error)) throw error
    throw new Error(`Icon "${input.icon}": ${error.message}.`, {
      cause: error
    })
  }
}
