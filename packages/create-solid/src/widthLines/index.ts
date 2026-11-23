type WidthLines = { text: string; fits: (line: string) => boolean }

// WHY: A path keeps every character where it is cut: a break at a space would drop the space or hide it at the end of a line.
export function widthLines({ text, fits }: WidthLines): string[] {
  const lines: string[] = []
  let line = ''
  for (const { segment } of new Intl.Segmenter().segment(text)) {
    if (line && !fits(line + segment)) {
      lines.push(line)
      line = ''
    }
    line += segment
  }
  return [...lines, line]
}
