# Icons plugin reference

These guides document [`@evertondgn/vite-plugin-solid-icons`](../README.md).
They ship in its npm package, so
`node_modules/@evertondgn/vite-plugin-solid-icons/docs/` holds the reference of
the version an app installed. Start with the [package README](../README.md),
which is also its npm page: it covers the requirements, the install and setup,
the errors that name an icon, the options and how the plugin is tested.

| I want to                                                            | Read                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Import icons by name, rename them and re-export them                 | [Import icons by name](imports.md#import-icons-by-name)                    |
| Import one icon by its path, or load it when the page needs it       | [Import one icon by its path](imports.md#import-one-icon-by-its-path)      |
| Get the SVG markup as a string                                       | [The SVG as text](imports.md#the-svg-as-text)                              |
| Know which import forms the build refuses                            | [What is not supported, and why](imports.md#what-is-not-supported-and-why) |
| Declare a folder of SVG files and know what the plugin reads from it | [Installed collections and your own folders](collections.md)               |
| Know what the dev server does when an SVG file changes               | [SVG edits without a restart](collections.md#svg-edits-without-a-restart)  |
| Know what the build refuses in an SVG file and what it leaves        | [What the plugin does with your SVG files](svg-files.md)                   |
| Predict the export name of an icon                                   | [Names you can predict](names.md)                                          |
| Type the names of a collection and write or check the file in CI     | [Typed names and a suggestion on a typo](types.md)                         |
