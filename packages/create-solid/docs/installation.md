The destination must be empty. Use `--no-git` to omit Git initialization or
`--no-install` to install dependencies later. The npm profile uses the upstream
Markdown converter without the Bun and pnpm patch.

For programmatic generation, import `generate` from `@evertondgn/create-solid`.
Pass the destination, installer and the two setup switches explicitly:

```js
import { generate } from '@evertondgn/create-solid'

generate({
  dir: 'my-app',
  pm: 'bun',
  shouldInitGit: true,
  shouldInstall: true,
  siteUrl: 'https://example.com'
})
```

`siteUrl` is optional. Generation uses the global Vite+ CLI to format the
rewritten files, including when installation is deferred.
