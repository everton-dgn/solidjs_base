export function* uiProfiles(): Generator<
  Record<'hasTheme' | 'hasIcons' | 'hasFonts', boolean>
> {
  for (const hasTheme of [true, false]) {
    for (const hasIcons of [true, false]) {
      for (const hasFonts of [true, false]) {
        yield { hasTheme, hasIcons, hasFonts }
      }
    }
  }
}
