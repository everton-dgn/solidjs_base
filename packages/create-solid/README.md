# @evertondgn/create-solid

Generate a Solid Base application. All features are enabled by default. Use the
global Vite+ CLI to run tasks in the generated application. After the first
registry release, run:

```sh
bunx @evertondgn/create-solid@latest my-app
```

Use `--pm bun|pnpm|npm` to choose the installer. Bun is required to run the
application tasks for all three managers. See
[installation](docs/installation.md).

Pass `--no-fonts` to use system fonts or `--no-diagnostics` to omit the Solid
reactivity diagnostics package and its development endpoint. Use `--fonts` and
`--diagnostics` to select those defaults explicitly.

Use macOS or Linux. Set the public origin with
`--site-url https://your-domain.example`. The default is `https://example.com`.
