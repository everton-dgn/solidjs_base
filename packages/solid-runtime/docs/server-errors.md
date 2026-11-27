# Server error protection

[Runtime reference](README.md)

The server entries use the `solid` condition and retain `server-only`. A used
import from a client entry fails the build. There is no barrel.

| Entry                               | Exports                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `./server/configure-server-errors`  | `configureServerErrors`                                                                                       |
| `./server/public-errors`            | `createPublicError`, `isPublicError`, `publicErrorMessage`                                                    |
| `./server/protect-server-operation` | `protectServerOperation`                                                                                      |
| `./server/log-server-failure`       | `logServerFailure`                                                                                            |
| `./server/is-control-response`      | `isControlResponse`                                                                                           |
| `./server/render-integrity`         | `createRenderIntegrity`, `markRenderFailure`, `observeRenderFailures`                                         |
| `./server/publication-scope`        | `withPublicationScope`, `assertPublicationActive`, `isPublicationCancellation`, `observePublicationOperation` |
| `./server/create-render-options`    | `createRenderOptions`, described in [Authored render entries](#authored-render-entries)                       |

Point `defineSolidApp` at the application's privileged setup path:

```ts
serverSetup: './src/infra/server/configureServerErrors/index.ts'
```

Without translations, that file only registers the protection:

```ts
import { configureServerErrors } from '@evertondgn/solid-runtime/server/configure-server-errors'

configureServerErrors()
```

With translations, the same file passes its own synchronous public text:

```ts
import { configureServerErrors } from '@evertondgn/solid-runtime/server/configure-server-errors'
import { m } from '@paraglide/messages.js'
import { isLocale } from '@paraglide/runtime.js'

configureServerErrors({
  publicMessage: locale => {
    if (!isLocale(locale)) throw new Error('Unsupported public message locale')
    return m.configureServerErrors_message({}, { locale })
  }
})
```

`publicMessage?: (locale: string) => string` receives the request locale from
`i18n/locale`. The runtime does not import the application's translation
provider. With no callback, failed locale resolution, a throwing callback or an
invalid callback result, the message is `The request could not be completed.`.
Failures do not log or reuse the callback error. A callback has no access to the
original error and must return only public text. Calling the configurator again
replaces the callback and hooks; setup should call it once.

`protectServerOperation({ run })` preserves synchronous and asynchronous return
shapes while checking plain public data. It creates a fresh public error for
failures, even when the previous error was already public. The public type
rejects `allowControl` when the field is present in the argument's static type,
including variables and spreads. A value narrowed to `{ run: () => T }` can
retain that extra field without a type diagnostic; the wrapper still forwards
only `run` and discards extra options. Only the private global registration
variant enables framework controls. Neither that variant nor the message setter
has a subpath. The application keeps `requestJson`, the shared controller
instance and source registries, its document adapter and authored render trees.
The runtime owns middleware containment and the shared entry helpers. Production
logs contain only the fixed source line and filtered class/frames; development
diagnostics retain the existing original-error behavior.

The tooling lint reserves the configurator and `observeRenderFailures` for
`src/infra/server/configureServerErrors/index.ts`, which must not export
anything in applications. Production imports cannot contain a `node_modules`
path segment; consumers use the package's public exports. Backend import
restrictions normalize dot segments and repeated separators before matching
paths. Installed SSR scenarios check bodies and drained preview logs with both
Bun linkers, German messages, callback fallback and the client build barrier.
See
[ADR 0028](https://github.com/everton-dgn/solidjs_base/blob/main/docs/ADRs/0028-runtime-server-errors.md).

## Authored render entries

Two calls keep your own entries safe to publish and to hydrate. A render that
failed halfway never becomes Markdown, and a tab that loaded a locale other than
the one in its URL reloads before it hydrates.

`server/create-render-options` exports `createRenderOptions()`. Call it before
rendering and spread the returned options into `renderToStream` alongside the
application manifest. It installs the render-integrity state, forwards the event
nonce and cancellation signal, and completes the state through `onCompleteAll`.
It never supplies `onError`, which would override the global error policy. Keep
that completion callback when adding options.

`i18n/prepare-client-locale` exports `prepareClientLocale({ reload? })`. Before
hydration it compares the loaded navigation locale with the current URL. A
mismatch reloads and returns `shouldHydrate: false`. Otherwise it installs the
history guard and returns `shouldHydrate: true` and `dispose()`. Register that
cleanup in the entry's existing HMR callback. It also works with the
single-language provider. Both entries are inert until called.

The application retains its client/server entry pair, identical authored tree,
Document's literal `/src/entry-client.tsx`, hydration instrumentation and
outdated-page policy. See
[ADR 0029](https://github.com/everton-dgn/solidjs_base/blob/main/docs/ADRs/0029-runtime-middleware-chain.md).
