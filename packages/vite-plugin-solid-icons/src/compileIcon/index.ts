import { isSvgError, parseSvg, svgJsx, svgText } from '../svgMarkup/index.ts'

type CompileInput = {
  svg: string
  isRaw: boolean
  // The icon as an import names it, as in own/star, for the error.
  icon: string
}

// The module goes through the Solid plugin as TSX, so the compiler of the
// installed Solid version writes the DOM and the SSR output. The markup of
// the component and of the raw text is written again from what the SVG
// parses to, so no text of the file becomes code of the module.
function moduleCode({ svg, isRaw }: CompileInput): CompiledIcon {
  const parsed = parseSvg({ svg, isComponent: !isRaw })
  const code = isRaw
    ? `export default ${JSON.stringify(svgText(parsed.root))}\n`
    : `export default (props = {}) => ${svgJsx(parsed.root)}\n`
  return { code, dropped: parsed.dropped }
}

export type CompiledIcon = {
  code: string
  // The editor data that the icon left out, such as <metadata>.
  dropped: string[]
}

export function compileIcon(input: CompileInput): CompiledIcon {
  try {
    return moduleCode(input)
  } catch (error) {
    if (!isSvgError(error)) throw error
    throw new Error(`Icon "${input.icon}": ${error.message}.`, {
      cause: error
    })
  }
}
