The destination must be empty. Use `--no-git` to omit Git initialization or
`--no-install` to install dependencies later. The npm profile uses the upstream
Markdown converter without the Bun and pnpm patch.

For programmatic generation, import `generate` from `@evertondgn/create-solid`.
Pass the destination, installer and the two setup switches explicitly:

```js
import { generate } from '@evertondgn/create-solid'

const nextSteps = generate({
  dir: 'my-app',
  pm: 'bun',
  shouldInitGit: true,
  shouldInstall: true,
  siteUrl: 'https://example.com'
})
console.log(nextSteps.join('\n'))
```

`siteUrl` is optional. The build prepares the formatted template. After a pnpm
installation the generator uses the installed application's Vite+ to format the
workspace settings that pnpm may update.
