# SSR integrity in the Markdown publication

[Back to the main guide](../server-errors.md)

## SSR integrity for Markdown

The entry calls `createRenderOptions()` from
`@evertondgn/solid-runtime/server/create-render-options` before rendering. That
helper creates the state with `createRenderIntegrity()`, from
[renderIntegrity](../../../../packages/solid-runtime/src/infra/server/renderIntegrity/index.ts),
and stores it in `event.locals.ssrRenderState` before the entry calls
`renderToStream`. Its returned options carry the request nonce, signal and
completion callback; the authored Document/App tree stays in the application.
The state is read-only: the `configureServerErrors` hook sets `hasErrors`
through `markRenderFailure` when it receives a failure with `kind: "render"`,
and `onCompleteAll` sets `hasCompleted` through the `complete` function of the
same factory. A state created outside it is not marked. Control signals mark it
too: a `redirect()` or `respond()` thrown in the render and caught by a nested
`<Errored>` becomes a fallback with a 200 HTML response. Since
[solidjs/solid#4130](https://github.com/solidjs/solid/pull/4130), the hook
receives each error once per kind in each request. A server function failure
contained by a boundary arrives first as `server-function` and then as `render`,
and only the second notice marks the state. The callback alone does not prove
integrity: it can also happen after a fragment failure. The adapter requires
completion and a strict absence of errors seen by the render after waiting for
the SSR, before publishing converted HTML. A missing or invalid state results in
a public 500 error without cache. Redirects and responses that are not eligible
pages keep their previous flow. The static pages go through this same adapter in
the build prerender, and a refusal there stops the build.

Because the hook is the source of this signal, it is also installed in
development, where it marks the state without replacing the error, as described
in [Failure log](logging.md#failure-log). The entry still has no local
`onError`: it would take precedence over the global hook, bypass the
sanitization and the log, and leave the state unmarked, and the Markdown would
publish with `hasErrors: false`. The hook registration calls
`observeRenderFailures()`; until then the factory creates the state with an
undefined `hasErrors`, and the Markdown refuses the page. Without the Vite
`serverFunctions.serverSetup`, which loads the registration, every `.md` answers
500 and the prerender stops the build.

The hook finds the state through the event that the runtime associates with the
failure. Serializer failures, an `onCleanup` that throws and the `<Errored>`
fallback arrive without the event, and the runtime reads it from
`AsyncLocalStorage`. A failure reported outside that context would not mark the
state, and the Markdown would publish the HTML. The serialization tests cover
these three cases with the context present.

The default serializer reports parse and emit failures to the hook, even without
a local hook. Before the first send, the first failure sets `hasErrors`, goes
through the `configureServerErrors` policy and ends the render without calling
`onCompleteAll`. Synchronous failures follow this path too, without rethrowing
the exception to the caller. The disposal releases the owner and the pending
async sources.

In streamed HTML, a failure while the shell is being built prevents it from
being sent, and the response is a 500. After the shell, the bytes already sent
cannot be taken back: the failure reaches the hook, the render goes on and the
client receives the rejected key with an error that only names the key and the
serialization failure. During hydration, reading that key falls into the nearest
`<Errored>`; the original message stays on the server. Markdown waits for the
render, so every failure happens before the send, and the publication is refused
with a public 500 error and `cache-control: private, no-store`. A serialization
failure does not depend on the adapter timeout to end the response.

Custom serializers keep the runtime behavior: the failures they report reach the
hook, but do not end the render. Errors suppressed internally are not
observable. Any adoption requires validating the relation between content,
completion and failures.

The runtime also ends the render when the default serializer fails
synchronously, while writing a value, before the first send, as it does when the
failure comes after the write, such as in the rejection of an async value
([solidjs/solid#4647](https://github.com/solidjs/solid/issues/4647)). It skips
`onCompleteAll`, and `createSSRResponse` answers 500, so a failure while
building the shell no longer sends the HTML with status 200. Earlier versions
only reported that failure to the hook and completed the render through the
normal flow, and a Bun patch of `@solidjs/web` ended it until the published
package did
([solidjs/solid#4709](https://github.com/solidjs/solid/issues/4709)). The
synchronous and deferred cases of `markdownContent.serialization.node.test.ts`
and its 500 of a shell that failed to serialize are the regression tests:
without that behavior they fail on the `onCompleteAll` call and on the 200
status. Failures in the serialization phase reach the log as
`SerovalSerializationError`; the message and the cause are still dropped.

A render abandoned inside its first write no longer ends the process either.
`pipe` writes the shell and calls `buffer.flush()` on the next line. With a
shell of 16,384 characters or more, that first write already reaches the
destination, which may abandon the render right there: `createSSRResponse` does
this when the page declared `Location`, and the same happens when the write
throws or when the render signal is aborted inside it. The buffer that `abandon`
leaves has an empty `flush`
([solidjs/solid#4745](https://github.com/solidjs/solid/issues/4745)); before,
the next call threw a `TypeError` in a microtask that nobody awaited, and the
unhandled rejection ended the Node process. The regression test is in
`renderIntegrity.redirect.node.test.ts`, in the runtime package.

The Vitest Node project resolves the development build of `@solidjs/web`, so
these tests check `dist/server.dev.js`. With `NODE_ENV=production` they load
`dist/server.js`, the build of the deployed function; there, the two `<Errored>`
cases of the serialization file fail by design, because they expect a diagnostic
that only the development build prints.

[solidjs/solid#4193](https://github.com/solidjs/solid/issues/4193) reported
three gaps. [solidjs/solid#4206](https://github.com/solidjs/solid/pull/4206)
took the serializer failures to the global hook, started containing an
`onCleanup` that throws in the disposal of the normal completion and made the
core run every cleanup even after one that throws.
[solidjs/solid#4229](https://github.com/solidjs/solid/pull/4229) made the render
complete on a synchronous failure, and
[solidjs/solid#4246](https://github.com/solidjs/solid/pull/4246) ends each write
at the first value that fails. #4647 ends the render on an async failure before
the send and rejects on the client the key that fails after it, and the fix of
#4709 ends it on a synchronous failure. A closed issue or PR does not replace
checking the installed artifacts: on every Solid upgrade, run the regression
tests for an error reused across requests, a server function failure that
escapes Loading, local recovery, serialization, a cleanup that throws and
cancellation. The combined timeout and disconnection signal reaches
`renderToStream`; the Node test of the adapter checks the disposal of a pending
SSR root on cancellation.

On abandonment by cancellation, the `renderToStream` thenable rejects with
`signal.reason`, including for consumers registered after the abort, without
calling `onCompleteAll`
([solidjs/solid#4646](https://github.com/solidjs/solid/issues/4646)). Before
that fix, the runtime disposed the root and kept the wait pending, and a Bun
patch covered the rejection. The publication protection does not mistake that
rejection for the end of the backend: `protectServerOperation` registers the
Promises in the async context of the publication, and the slot stays taken until
they settle. Common operations, outside that context, keep the previous
behavior. `containFailures` recognizes that rejection by identity with
`signal.reason`, so the reason has to arrive unwrapped; otherwise, the
cancellation goes back to the `[middleware]` log. The regression tests are in
`markdownContent.abort.node.test.ts` in the application,
`containFailures.abort.node.test.ts` in the runtime,
`publicationScope.node.test.ts` and the HTTP disconnection scenario of
`PublicationLoad`. When upgrading Solid, check this contract too.
