import { editTemplate } from '../edit-template.ts'
import type { GenerationContext } from '../types.ts'

export function removeCatalogTasks(pkg: GenerationContext['pkg']): void {
  if (!pkg.scripts['i18n:generate']) {
    throw new Error('Missing i18n:generate script in the application template')
  }
  delete pkg.scripts['i18n:generate']
  for (const [name, command] of Object.entries(pkg.scripts)) {
    if (command.includes('i18n:generate')) {
      pkg.scripts[name] = editTemplate({
        file: `package.json scripts.${name}`,
        text: command,
        pattern: /^vp run i18n:generate && /u,
        replacement: ''
      })
    }
  }
  for (const dependencies of [pkg.dependencies, pkg.devDependencies]) {
    for (const name of Object.keys(dependencies)) {
      if (name.startsWith('@inlang/')) {
        Reflect.deleteProperty(dependencies, name)
      }
    }
  }
}
