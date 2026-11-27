# Collections

[Icons plugin reference](README.md)

## Installed collections and your own folders

An Iconify collection is any `@iconify-json/<collection>` package the
application installs. Its icons and its aliases are available under the name of
the collection, as in `icon:hugeicons`.

A folder collection is a folder of SVG files that you declare in `collections`,
relative to the Vite root:

```ts
solidIcons({
  collections: {
    brand: './src/assets/icons',
    flags: './src/assets/flags'
  }
})
```

- Every `.svg` file is an icon: `src/assets/icons/logo.svg` is `icon:brand/logo`
  and `Logo`.
- A file name may contain dots, as in `logo.v2.svg`, imported as
  `icon:brand/logo.v2` or by its name, `LogoV2`.
- An import names the file exactly, in the same case, on every file system:
  `icon:brand/Logo` does not load `logo.svg` on macOS either, and the error
  names the file that the folder has.
- A symbolic link to an SVG file is not read, so an icon cannot reach a file
  outside the folder. The error says that the file is a link. The folder itself
  may be a link.
- The plugin keeps the folder that it found when the dev server or the build
  started: its real path, where a folder declared as a link led then, and its
  device and inode. Every read of an icon checks both, so a folder replaced
  after that, or a folder above it, stops the imports of its icons with the
  folder in the error, until you stop and start the dev server. That covers a
  folder replaced by another folder, by a link to another folder, and a folder
  moved away and replaced by a link to it, which keeps its files. A folder
  declared as a link that leads to another folder after the start, and a
  checkout that removes the folder and creates it again, stop the imports too.
- The listing knows a file of the folder by its device and inode, not by its
  path. A file with another identity, as an editor writes when it saves to a new
  file and renames it over the icon, is listed again and read. A hard link reads
  as the regular file it is, on every read: making one takes a write in the
  folder, as a new SVG does, and a file moved over the icon reads the same way.
- So an icon comes from a regular file of the folder that the plugin found
  first, which does not tell where the content of the file came from. Node reads
  a folder by its path, so a folder swapped and put back between two checks is
  not seen. Windows has no flag to open a file without following a link, and the
  identity of a file comes from its file system there: the checks are tested on
  macOS and Linux.
- A file whose name an import cannot spell, as in `my icon.svg` or `ícone.svg`,
  has no import and no export name. The dev server and the build warn once with
  its name.
- A collection name uses lowercase letters, digits and single hyphens. Another
  name stops the configuration with the list of the invalid names.
- A folder declared with the name of an installed collection takes its place.

## SVG edits without a restart

The dev server follows the files of every folder collection:

- Editing an SVG file updates the icon on the page without a reload.
- Adding a file makes its icon available. An import that failed because the file
  was missing loads once the file exists.
- Removing a file shows the error of the missing icon in the error overlay.
- Renaming a file changes the names of its collection: `moon.svg` renamed to
  `moon-2.svg` turns `Moon` into `Moon2`, the import of `Moon` shows
  `"Moon" is not an icon of 'icon:brand'. Did you mean Moon2?`, and the
  declaration file follows.

Adding, removing and renaming reload the page, because a page whose import
failed cannot apply a hot update.

A build with `--watch` follows the same folders: a file added, removed or
renamed changes the names of its collection and the declaration file, and the
next build reads them.
