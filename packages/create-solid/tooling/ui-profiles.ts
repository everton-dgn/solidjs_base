export function* uiProfiles(): Generator<
  Record<'theme' | 'icons' | 'fonts', boolean>
> {
  for (const theme of [true, false]) {
    for (const icons of [true, false]) {
      for (const fonts of [true, false]) yield { theme, icons, fonts }
    }
  }
}
