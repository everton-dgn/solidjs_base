# Runtime reference

These guides document [`@evertondgn/solid-runtime`](../README.md). They ship in
its npm package, so `node_modules/@evertondgn/solid-runtime/docs/` holds the
reference of the version an app installed. Start with the
[package README](../README.md), which is also its npm page: it covers the
requirements, the install command, a working setup, each feature and how the
package is tested. The guides below hold the API of each part, in the order of
the README's features.

| I want to                                                                 | Read                                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Know what each entry point imports and how the entries resolve            | [Entry points and requirements](entry-points.md)                                                              |
| Build the middleware chain and change a header or a CSP directive         | [Middleware and security headers](middleware.md)                                                              |
| Register the server error protection and wrap a backend adapter           | [Server error protection](server-errors.md)                                                                   |
| Keep the render integrity and the client locale in my own entries         | [Authored render entries](server-errors.md#authored-render-entries)                                           |
| Read the locale, build localized URLs and navigate without losing it      | [Locale support](i18n.md)                                                                                     |
| Redirect a request to its localized URL and keep the choice in a cookie   | [Locale request middleware](i18n.md#locale-request-middleware)                                                |
| Read, apply and store a light, dark or system theme                       | [Optional theme](theme.md)                                                                                    |
| Publish head tags, JSON-LD and `robots.txt`                               | [Optional SEO](seo.md)                                                                                        |
| Answer pages as Markdown and publish `llms.txt`                           | [Markdown and editorial indexes](markdown.md)                                                                 |
| Publish sitemaps and share one publication controller                     | [Sitemap and publication](sitemaps-and-publication.md)                                                        |
| Validate the environment values the presets use                           | [Optional environment validation](env.md)                                                                     |
| Render the font links of the preset in a server-rendered Document         | [Optional fonts](fonts.md)                                                                                    |
| Configure the preset that serves the virtual modules these entries import | [Tooling guides](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-tooling/docs/README.md) |
